import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const InsightsController = {
    /**
     * GET /api/insights
     * Returns AI-detected insights: anomalies, patterns, and suggestions
     */
    list: async (req, res) => {
        try {
            const userId = req.user.id;
            const type = req.query.type; // 'anomaly', 'pattern', 'suggestion', 'all'
            const severity = req.query.severity; // 'critical', 'high', 'medium', 'low'
            const limit = parseInt(req.query.limit) || 20;

            const repos = await prisma.repo.findMany({
                where: { userId },
                select: { id: true, name: true, owner: true }
            });
            const repoIds = repos.map(r => r.id);
            const repoMap = new Map(repos.map(r => [r.id, `${r.owner}/${r.name}`]));

            if (repoIds.length === 0) {
                return res.json([]);
            }

            const now = new Date();
            const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

            const insights = [];

            // 1. ANOMALIES: Detect spikes in failure rates
            const [failures24h, total24h, failures7d, total7d] = await Promise.all([
                prisma.workflowRun.count({
                    where: { repoId: { in: repoIds }, status: 'failure', createdAt: { gte: last24h } }
                }),
                prisma.workflowRun.count({
                    where: { repoId: { in: repoIds }, createdAt: { gte: last24h } }
                }),
                prisma.workflowRun.count({
                    where: { repoId: { in: repoIds }, status: 'failure', createdAt: { gte: last7d } }
                }),
                prisma.workflowRun.count({
                    where: { repoId: { in: repoIds }, createdAt: { gte: last7d } }
                })
            ]);

            const rate24h = total24h > 0 ? (failures24h / total24h) * 100 : 0;
            const rate7d = total7d > 0 ? (failures7d / total7d) * 100 : 0;
            const avgDailyRate = rate7d;

            // Spike detection: 24h rate is 50%+ higher than 7d average
            if (rate24h > avgDailyRate * 1.5 && failures24h > 0) {
                const spike = Math.round(((rate24h - avgDailyRate) / Math.max(avgDailyRate, 1)) * 100);
                insights.push({
                    id: `anomaly-spike-${Date.now()}`,
                    type: 'anomaly',
                    severity: spike > 100 ? 'critical' : 'high',
                    title: 'Failure Rate Spike Detected',
                    description: `${spike}% increase in failure rate in the last 24 hours`,
                    details: `Current 24h rate: ${rate24h.toFixed(1)}% vs 7-day average: ${avgDailyRate.toFixed(1)}%. Investigate recent changes.`,
                    confidence: Math.min(95, 70 + Math.floor(spike / 10)),
                    time: 'Last 24 hours',
                    actionable: true
                });
            }

            // 2. PATTERNS: Find recurring failure types
            const failurePatterns = await prisma.analysisResult.groupBy({
                by: ['failureType', 'failureStage'],
                where: {
                    workflowRun: { repoId: { in: repoIds }, createdAt: { gte: last7d } }
                },
                _count: true,
                orderBy: { _count: { failureType: 'desc' } },
                take: 5
            });

            for (const pattern of failurePatterns) {
                if (pattern._count >= 3) {
                    // Find which repo has this pattern most
                    const repoWithPattern = await prisma.analysisResult.findFirst({
                        where: {
                            failureType: pattern.failureType,
                            failureStage: pattern.failureStage,
                            workflowRun: { repoId: { in: repoIds } }
                        },
                        include: { workflowRun: { select: { repoId: true } } },
                        orderBy: { createdAt: 'desc' }
                    });

                    insights.push({
                        id: `pattern-${pattern.failureType}-${pattern.failureStage}`.toLowerCase().replace(/\s+/g, '-'),
                        type: 'pattern',
                        severity: pattern._count >= 10 ? 'high' : 'medium',
                        title: `Recurring ${pattern.failureType || 'Unknown'} Pattern`,
                        description: `${pattern._count} occurrences in ${pattern.failureStage || 'unknown stage'}`,
                        details: `This failure pattern has occurred ${pattern._count} times in the last 7 days. Consider adding automated handling or alerting.`,
                        confidence: Math.min(95, 60 + pattern._count * 3),
                        repository: repoWithPattern ? repoMap.get(repoWithPattern.workflowRun.repoId) : null,
                        time: 'Last 7 days',
                        actionable: true
                    });
                }
            }

            // 3. SUGGESTIONS: Repos with high failure rates
            for (const repo of repos) {
                const [repoFailures, repoTotal] = await Promise.all([
                    prisma.workflowRun.count({
                        where: { repoId: repo.id, status: 'failure', createdAt: { gte: last7d } }
                    }),
                    prisma.workflowRun.count({
                        where: { repoId: repo.id, createdAt: { gte: last7d } }
                    })
                ]);

                const repoFailureRate = repoTotal > 0 ? (repoFailures / repoTotal) * 100 : 0;

                if (repoFailureRate > 30 && repoTotal >= 5) {
                    insights.push({
                        id: `suggestion-${repo.id}`,
                        type: 'suggestion',
                        severity: repoFailureRate > 50 ? 'high' : 'medium',
                        title: `High Failure Rate in ${repo.name}`,
                        description: `${repoFailureRate.toFixed(0)}% failure rate over ${repoTotal} runs`,
                        details: `Repository has a ${repoFailureRate.toFixed(1)}% failure rate. Review recent changes, improve test coverage, or add retry logic.`,
                        confidence: Math.min(95, 70 + Math.floor(repoFailureRate / 5)),
                        repository: `${repo.owner}/${repo.name}`,
                        time: 'Last 7 days',
                        actionable: true
                    });
                }
            }

            // 4. Check for resolved issues (P0/P1 that had recent success)
            const recentCriticalFixed = await prisma.workflowRun.findMany({
                where: {
                    repoId: { in: repoIds },
                    status: 'success',
                    createdAt: { gte: last24h }
                },
                include: {
                    repo: { select: { name: true, owner: true } }
                },
                take: 5,
                orderBy: { createdAt: 'desc' }
            });

            // Check if any of these had prior failures
            for (const run of recentCriticalFixed) {
                const priorFailure = await prisma.workflowRun.findFirst({
                    where: {
                        repoId: run.repoId,
                        workflowName: run.workflowName,
                        branch: run.branch,
                        status: 'failure',
                        createdAt: { lt: run.createdAt }
                    },
                    include: {
                        analysis: { select: { priority: true, failureType: true } }
                    },
                    orderBy: { createdAt: 'desc' }
                });

                if (priorFailure?.analysis?.priority <= 1) {
                    insights.push({
                        id: `resolved-${run.id}`,
                        type: 'resolved',
                        severity: 'low',
                        title: `${priorFailure.analysis.failureType || 'Issue'} Resolved`,
                        description: `${run.workflowName} on ${run.branch} now passing`,
                        details: `Previous P${priorFailure.analysis.priority} failure has been fixed. Workflow is now stable.`,
                        confidence: 100,
                        repository: `${run.repo.owner}/${run.repo.name}`,
                        time: formatTimeAgo(run.createdAt),
                        actionable: false
                    });
                }
            }

            // Filter by type if specified
            let filtered = insights;
            if (type && type !== 'all') {
                filtered = filtered.filter(i => i.type === type);
            }
            if (severity) {
                filtered = filtered.filter(i => i.severity === severity);
            }

            // Sort by severity and limit
            const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
            filtered.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

            res.json(filtered.slice(0, limit));
        } catch (error) {
            console.error('Insights list error:', error);
            res.status(500).json({ error: 'Failed to fetch insights' });
        }
    },

    /**
     * GET /api/insights/summary
     * Returns summary counts for insights
     */
    getSummary: async (req, res) => {
        try {
            const userId = req.user.id;

            const repos = await prisma.repo.findMany({
                where: { userId },
                select: { id: true }
            });
            const repoIds = repos.map(r => r.id);

            const now = new Date();
            const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

            // Count critical issues (P0-P1 in last 24h)
            const criticalCount = await prisma.analysisResult.count({
                where: {
                    priority: { in: [0, 1] },
                    workflowRun: {
                        repoId: { in: repoIds },
                        createdAt: { gte: last24h }
                    }
                }
            });

            // Count patterns (distinct failureType+failureStage combinations)
            const patterns = await prisma.analysisResult.groupBy({
                by: ['failureType', 'failureStage'],
                where: {
                    workflowRun: { repoId: { in: repoIds }, createdAt: { gte: last7d } }
                },
                _count: true
            });
            const patternCount = patterns.filter(p => p._count >= 3).length;

            // Count suggestions (repos with >30% failure rate)
            let suggestionCount = 0;
            for (const repoId of repoIds) {
                const [failures, total] = await Promise.all([
                    prisma.workflowRun.count({
                        where: { repoId, status: 'failure', createdAt: { gte: last7d } }
                    }),
                    prisma.workflowRun.count({
                        where: { repoId, createdAt: { gte: last7d } }
                    })
                ]);
                if (total >= 5 && (failures / total) > 0.3) {
                    suggestionCount++;
                }
            }

            // Count resolved today (successes after failures)
            const resolvedCount = await prisma.workflowRun.count({
                where: {
                    repoId: { in: repoIds },
                    status: 'success',
                    createdAt: { gte: last24h }
                }
            });

            res.json({
                critical: criticalCount,
                patterns: patternCount,
                suggestions: suggestionCount,
                resolved: Math.min(resolvedCount, 10) // Cap at 10 for display
            });
        } catch (error) {
            console.error('Insights summary error:', error);
            res.status(500).json({ error: 'Failed to fetch insights summary' });
        }
    }
};

function formatTimeAgo(date) {
    const now = new Date();
    const diff = now - new Date(date);
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 60) return `${minutes} mins ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
}
