import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const AnalyticsController = {
    /**
     * GET /api/analytics/trends
     * Returns failure trends over time
     */
    getTrends: async (req, res) => {
        try {
            const userId = req.user.id;
            const days = parseInt(req.query.days) || 30;

            const repos = await prisma.repo.findMany({
                where: { userId },
                select: { id: true }
            });
            const repoIds = repos.map(r => r.id);

            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);

            // Get all runs in the date range
            const runs = await prisma.workflowRun.findMany({
                where: {
                    repoId: { in: repoIds },
                    createdAt: { gte: startDate }
                },
                select: {
                    status: true,
                    createdAt: true
                },
                orderBy: { createdAt: 'asc' }
            });

            // Group by date
            const trendsByDate = {};
            runs.forEach(run => {
                const date = run.createdAt.toISOString().split('T')[0];
                if (!trendsByDate[date]) {
                    trendsByDate[date] = { total: 0, failures: 0, successes: 0 };
                }
                trendsByDate[date].total++;
                if (run.status === 'failure') {
                    trendsByDate[date].failures++;
                } else if (run.status === 'success') {
                    trendsByDate[date].successes++;
                }
            });

            // Convert to array
            const trends = Object.entries(trendsByDate).map(([date, counts]) => ({
                date,
                ...counts,
                failureRate: counts.total > 0 ? ((counts.failures / counts.total) * 100).toFixed(1) : 0
            }));

            res.json(trends);
        } catch (error) {
            console.error('Trends error:', error);
            res.status(500).json({ error: 'Failed to fetch trends' });
        }
    },

    /**
     * GET /api/analytics/categories
     * Returns failures by category/priority
     */
    getCategories: async (req, res) => {
        try {
            const userId = req.user.id;
            const days = parseInt(req.query.days) || 30;

            const repos = await prisma.repo.findMany({
                where: { userId },
                select: { id: true }
            });
            const repoIds = repos.map(r => r.id);

            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);

            // Get failure type distribution
            const failureTypes = await prisma.analysisResult.groupBy({
                by: ['failureType'],
                where: {
                    workflowRun: {
                        repoId: { in: repoIds },
                        createdAt: { gte: startDate }
                    }
                },
                _count: true
            });

            // Get priority distribution
            const priorities = await prisma.analysisResult.groupBy({
                by: ['priority'],
                where: {
                    workflowRun: {
                        repoId: { in: repoIds },
                        createdAt: { gte: startDate }
                    }
                },
                _count: true
            });

            // Get most common failure stages
            const stages = await prisma.analysisResult.groupBy({
                by: ['failureStage'],
                where: {
                    workflowRun: {
                        repoId: { in: repoIds },
                        createdAt: { gte: startDate }
                    }
                },
                _count: true,
                orderBy: {
                    _count: {
                        failureStage: 'desc'
                    }
                },
                take: 10
            });

            res.json({
                byFailureType: failureTypes.map(f => ({
                    type: f.failureType || 'Unknown',
                    count: f._count
                })),
                byPriority: priorities.map(p => ({
                    priority: p.priority,
                    label: getPriorityLabel(p.priority),
                    count: p._count
                })),
                byStage: stages.map(s => ({
                    stage: s.failureStage,
                    count: s._count
                }))
            });
        } catch (error) {
            console.error('Categories error:', error);
            res.status(500).json({ error: 'Failed to fetch categories' });
        }
    },

    /**
     * GET /api/analytics/top-failures
     * Returns most common failure patterns
     */
    getTopFailures: async (req, res) => {
        try {
            const userId = req.user.id;
            const limit = parseInt(req.query.limit) || 10;

            const repos = await prisma.repo.findMany({
                where: { userId },
                select: { id: true }
            });
            const repoIds = repos.map(r => r.id);

            // Get most common root causes (simplified by failureStage)
            const topFailures = await prisma.analysisResult.groupBy({
                by: ['failureStage', 'failureType'],
                where: {
                    workflowRun: {
                        repoId: { in: repoIds }
                    }
                },
                _count: true,
                orderBy: {
                    _count: {
                        failureStage: 'desc'
                    }
                },
                take: limit
            });

            res.json(topFailures.map(f => ({
                failureStage: f.failureStage,
                failureType: f.failureType || 'Unknown',
                count: f._count
            })));
        } catch (error) {
            console.error('Top failures error:', error);
            res.status(500).json({ error: 'Failed to fetch top failures' });
        }
    }
};

function getPriorityLabel(priority) {
    const labels = {
        0: 'P0 - Intentional',
        1: 'P1 - Test Failure',
        2: 'P2 - Build Failure',
        3: 'P3 - Runtime Error',
        4: 'P4 - Infra/Dependency',
        5: 'P5 - Lint/Warning'
    };
    return labels[priority] || `P${priority}`;
}
