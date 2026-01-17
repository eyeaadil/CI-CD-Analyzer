import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const IncidentsController = {
    /**
     * GET /api/incidents
     * Returns active incidents (P0-P1 failures that haven't been resolved)
     */
    list: async (req, res) => {
        try {
            const userId = req.user.id;
            const status = req.query.status; // 'active', 'resolved', 'all'
            const priority = req.query.priority ? parseInt(req.query.priority) : undefined;
            const limit = parseInt(req.query.limit) || 20;

            const repos = await prisma.repo.findMany({
                where: { userId },
                select: { id: true }
            });
            const repoIds = repos.map(r => r.id);

            if (repoIds.length === 0) {
                return res.json([]);
            }

            // Build where clause for high priority failures
            const where = {
                repoId: { in: repoIds },
                status: 'failure',
                analysis: {
                    priority: priority !== undefined ? priority : { lte: 5 } // Show all priorities by default
                }
            };

            const incidents = await prisma.workflowRun.findMany({
                where,
                orderBy: [
                    { createdAt: 'desc' }
                ],
                take: limit,
                include: {
                    repo: {
                        select: { name: true, owner: true }
                    },
                    analysis: {
                        select: {
                            rootCause: true,
                            failureStage: true,
                            suggestedFix: true,
                            priority: true,
                            failureType: true
                        }
                    }
                }
            });

            // Check which incidents have been "resolved" (newer successful run exists)
            const incidentsWithStatus = await Promise.all(incidents.map(async (incident) => {
                const newerSuccess = await prisma.workflowRun.findFirst({
                    where: {
                        repoId: incident.repoId,
                        workflowName: incident.workflowName,
                        branch: incident.branch,
                        status: 'success',
                        createdAt: { gt: incident.createdAt }
                    }
                });

                const isResolved = !!newerSuccess;

                return {
                    id: incident.id,
                    githubRunId: incident.githubRunId,
                    workflowName: incident.workflowName,
                    branch: incident.branch,
                    actor: incident.actor,
                    commitSha: incident.commitSha.substring(0, 7),
                    runUrl: incident.runUrl,
                    createdAt: incident.createdAt,
                    status: isResolved ? 'resolved' : 'active',
                    repo: {
                        name: incident.repo.name,
                        owner: incident.repo.owner,
                        fullName: `${incident.repo.owner}/${incident.repo.name}`
                    },
                    analysis: incident.analysis ? {
                        rootCause: incident.analysis.rootCause,
                        failureStage: incident.analysis.failureStage,
                        suggestedFix: incident.analysis.suggestedFix,
                        priority: incident.analysis.priority,
                        priorityLabel: getPriorityLabel(incident.analysis.priority),
                        failureType: incident.analysis.failureType
                    } : null
                };
            }));

            // Filter by status if requested
            let filtered = incidentsWithStatus;
            if (status === 'active') {
                filtered = filtered.filter(i => i.status === 'active');
            } else if (status === 'resolved') {
                filtered = filtered.filter(i => i.status === 'resolved');
            }

            res.json(filtered);
        } catch (error) {
            console.error('Incidents list error:', error);
            res.status(500).json({ error: 'Failed to fetch incidents' });
        }
    },

    /**
     * GET /api/incidents/:id
     * Get single incident details
     */
    getById: async (req, res) => {
        try {
            const userId = req.user.id;
            const incidentId = parseInt(req.params.id);

            const incident = await prisma.workflowRun.findUnique({
                where: { id: incidentId },
                include: {
                    repo: {
                        select: { id: true, name: true, owner: true, userId: true }
                    },
                    analysis: true,
                    chunks: {
                        where: { hasErrors: true },
                        orderBy: { chunkIndex: 'asc' },
                        take: 5,
                        select: {
                            id: true,
                            stepName: true,
                            content: true,
                            errorCount: true
                        }
                    }
                }
            });

            if (!incident) {
                return res.status(404).json({ error: 'Incident not found' });
            }

            if (incident.repo.userId !== userId) {
                return res.status(403).json({ error: 'Access denied' });
            }

            // Check if resolved
            const newerSuccess = await prisma.workflowRun.findFirst({
                where: {
                    repoId: incident.repoId,
                    workflowName: incident.workflowName,
                    branch: incident.branch,
                    status: 'success',
                    createdAt: { gt: incident.createdAt }
                },
                select: { id: true, createdAt: true, commitSha: true }
            });

            res.json({
                id: incident.id,
                githubRunId: incident.githubRunId,
                workflowName: incident.workflowName,
                branch: incident.branch,
                actor: incident.actor,
                commitSha: incident.commitSha,
                runUrl: incident.runUrl,
                createdAt: incident.createdAt,
                status: newerSuccess ? 'resolved' : 'active',
                resolvedBy: newerSuccess ? {
                    runId: newerSuccess.id,
                    commitSha: newerSuccess.commitSha.substring(0, 7),
                    resolvedAt: newerSuccess.createdAt
                } : null,
                repo: {
                    id: incident.repo.id,
                    name: incident.repo.name,
                    owner: incident.repo.owner,
                    fullName: `${incident.repo.owner}/${incident.repo.name}`
                },
                analysis: incident.analysis ? {
                    rootCause: incident.analysis.rootCause,
                    failureStage: incident.analysis.failureStage,
                    suggestedFix: incident.analysis.suggestedFix,
                    priority: incident.analysis.priority,
                    priorityLabel: getPriorityLabel(incident.analysis.priority),
                    failureType: incident.analysis.failureType,
                    detectedErrors: incident.analysis.detectedErrors
                } : null,
                errorLogs: incident.chunks.map(c => ({
                    stepName: c.stepName,
                    content: c.content.substring(0, 500) + (c.content.length > 500 ? '...' : ''),
                    errorCount: c.errorCount
                }))
            });
        } catch (error) {
            console.error('Incident getById error:', error);
            res.status(500).json({ error: 'Failed to fetch incident' });
        }
    },

    /**
     * GET /api/incidents/stats
     * Returns incident statistics
     */
    getStats: async (req, res) => {
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

            // Count by priority
            const [p0Count, p1Count, p2Count, total24h, total7d] = await Promise.all([
                prisma.analysisResult.count({
                    where: {
                        priority: 0,
                        workflowRun: { repoId: { in: repoIds }, status: 'failure' }
                    }
                }),
                prisma.analysisResult.count({
                    where: {
                        priority: 1,
                        workflowRun: { repoId: { in: repoIds }, status: 'failure' }
                    }
                }),
                prisma.analysisResult.count({
                    where: {
                        priority: 2,
                        workflowRun: { repoId: { in: repoIds }, status: 'failure' }
                    }
                }),
                prisma.workflowRun.count({
                    where: {
                        repoId: { in: repoIds },
                        status: 'failure',
                        createdAt: { gte: last24h }
                    }
                }),
                prisma.workflowRun.count({
                    where: {
                        repoId: { in: repoIds },
                        status: 'failure',
                        createdAt: { gte: last7d }
                    }
                })
            ]);

            // Active vs resolved (simplified)
            const activeIncidents = await prisma.workflowRun.count({
                where: {
                    repoId: { in: repoIds },
                    status: 'failure',
                    createdAt: { gte: last24h },
                    analysis: { priority: { lte: 1 } }
                }
            });

            res.json({
                total: p0Count + p1Count + p2Count,
                byPriority: {
                    p0: p0Count,
                    p1: p1Count,
                    p2: p2Count
                },
                activeCount: activeIncidents,
                last24h: total24h,
                last7d: total7d,
                mttr: null // Mean time to resolve - would need more data to calculate
            });
        } catch (error) {
            console.error('Incidents stats error:', error);
            res.status(500).json({ error: 'Failed to fetch incident stats' });
        }
    }
};

function getPriorityLabel(priority) {
    const labels = {
        0: 'P0 - Critical',
        1: 'P1 - High',
        2: 'P2 - Medium',
        3: 'P3 - Low',
        4: 'P4 - Info',
        5: 'P5 - Trivial'
    };
    return labels[priority] || `P${priority}`;
}
