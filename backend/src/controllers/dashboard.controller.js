import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const DashboardController = {
    /**
     * GET /api/dashboard/stats
     * Returns overview metrics for the dashboard
     */
    getStats: async (req, res) => {
        try {
            const userId = req.user.id;

            // Get user's repos
            const repos = await prisma.repo.findMany({
                where: { userId },
                select: { id: true }
            });
            const repoIds = repos.map(r => r.id);

            // Time ranges
            const now = new Date();
            const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

            // Get run counts
            const [totalRuns, failedRuns24h, totalRuns24h, failedRuns7d, totalRuns7d] = await Promise.all([
                prisma.workflowRun.count({
                    where: { repoId: { in: repoIds } }
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
                        createdAt: { gte: last24h }
                    }
                }),
                prisma.workflowRun.count({
                    where: {
                        repoId: { in: repoIds },
                        status: 'failure',
                        createdAt: { gte: last7d }
                    }
                }),
                prisma.workflowRun.count({
                    where: {
                        repoId: { in: repoIds },
                        createdAt: { gte: last7d }
                    }
                })
            ]);

            // Get priority distribution
            const priorityDistribution = await prisma.analysisResult.groupBy({
                by: ['priority'],
                where: {
                    workflowRun: {
                        repoId: { in: repoIds },
                        createdAt: { gte: last30d }
                    }
                },
                _count: true
            });

            // Calculate failure rate
            const failureRate24h = totalRuns24h > 0 ? ((failedRuns24h / totalRuns24h) * 100).toFixed(1) : 0;
            const failureRate7d = totalRuns7d > 0 ? ((failedRuns7d / totalRuns7d) * 100).toFixed(1) : 0;

            res.json({
                totalRepos: repos.length,
                totalRuns,
                failedRuns24h,
                totalRuns24h,
                failureRate24h: parseFloat(failureRate24h),
                failedRuns7d,
                totalRuns7d,
                failureRate7d: parseFloat(failureRate7d),
                priorityDistribution: priorityDistribution.map(p => ({
                    priority: p.priority,
                    count: p._count
                }))
            });
        } catch (error) {
            console.error('Dashboard stats error:', error);
            res.status(500).json({ error: 'Failed to fetch dashboard stats' });
        }
    },

    /**
     * GET /api/dashboard/recent
     * Returns recent failed workflow runs
     */
    getRecentFailures: async (req, res) => {
        try {
            const userId = req.user.id;
            const limit = parseInt(req.query.limit) || 10;

            const repos = await prisma.repo.findMany({
                where: { userId },
                select: { id: true }
            });
            const repoIds = repos.map(r => r.id);

            const recentFailures = await prisma.workflowRun.findMany({
                where: {
                    repoId: { in: repoIds },
                    status: 'failure'
                },
                orderBy: { createdAt: 'desc' },
                take: limit,
                include: {
                    repo: {
                        select: { name: true, owner: true }
                    },
                    analysis: {
                        select: {
                            rootCause: true,
                            failureStage: true,
                            priority: true,
                            failureType: true
                        }
                    }
                }
            });

            res.json(recentFailures.map(run => ({
                id: run.id,
                githubRunId: run.githubRunId,
                workflowName: run.workflowName,
                branch: run.branch,
                actor: run.actor,
                commitSha: run.commitSha.substring(0, 7),
                runUrl: run.runUrl,
                createdAt: run.createdAt,
                repo: {
                    name: run.repo.name,
                    owner: run.repo.owner,
                    fullName: `${run.repo.owner}/${run.repo.name}`
                },
                analysis: run.analysis ? {
                    rootCause: run.analysis.rootCause.substring(0, 150) + (run.analysis.rootCause.length > 150 ? '...' : ''),
                    failureStage: run.analysis.failureStage,
                    priority: run.analysis.priority,
                    failureType: run.analysis.failureType
                } : null
            })));
        } catch (error) {
            console.error('Recent failures error:', error);
            res.status(500).json({ error: 'Failed to fetch recent failures' });
        }
    },

    /**
     * GET /api/dashboard/activity
     * Returns activity timeline
     */
    getActivity: async (req, res) => {
        try {
            const userId = req.user.id;
            const limit = parseInt(req.query.limit) || 20;

            const repos = await prisma.repo.findMany({
                where: { userId },
                select: { id: true }
            });
            const repoIds = repos.map(r => r.id);

            const activity = await prisma.workflowRun.findMany({
                where: { repoId: { in: repoIds } },
                orderBy: { createdAt: 'desc' },
                take: limit,
                include: {
                    repo: {
                        select: { name: true, owner: true }
                    }
                }
            });

            res.json(activity.map(run => ({
                id: run.id,
                type: run.status === 'failure' ? 'failure' : 'success',
                workflowName: run.workflowName,
                branch: run.branch,
                actor: run.actor,
                status: run.status,
                createdAt: run.createdAt,
                repo: `${run.repo.owner}/${run.repo.name}`
            })));
        } catch (error) {
            console.error('Activity error:', error);
            res.status(500).json({ error: 'Failed to fetch activity' });
        }
    },

    /**
     * GET /api/dashboard/search?q=query
     * Search across repos and runs
     */
    search: async (req, res) => {
        try {
            const userId = req.user.id;
            const query = req.query.q?.trim();
            const limit = parseInt(req.query.limit) || 10;

            if (!query || query.length < 2) {
                return res.json({ repos: [], runs: [] });
            }

            // Get user's repos
            const repos = await prisma.repo.findMany({
                where: { userId },
                select: { id: true }
            });
            const repoIds = repos.map(r => r.id);

            // Search repos by name
            const matchingRepos = await prisma.repo.findMany({
                where: {
                    userId,
                    OR: [
                        { name: { contains: query, mode: 'insensitive' } },
                        { owner: { contains: query, mode: 'insensitive' } }
                    ]
                },
                take: limit,
                select: {
                    id: true,
                    name: true,
                    owner: true,
                    _count: { select: { runs: true } }
                }
            });

            // Search runs by workflow name, branch, commit, actor
            const matchingRuns = await prisma.workflowRun.findMany({
                where: {
                    repoId: { in: repoIds },
                    OR: [
                        { workflowName: { contains: query, mode: 'insensitive' } },
                        { branch: { contains: query, mode: 'insensitive' } },
                        { commitSha: { startsWith: query } },
                        { actor: { contains: query, mode: 'insensitive' } },
                        { githubRunId: { contains: query } }
                    ]
                },
                orderBy: { createdAt: 'desc' },
                take: limit,
                include: {
                    repo: { select: { name: true, owner: true } },
                    analysis: { select: { priority: true, failureType: true } }
                }
            });

            res.json({
                repos: matchingRepos.map(r => ({
                    id: r.id,
                    name: r.name,
                    owner: r.owner,
                    fullName: `${r.owner}/${r.name}`,
                    runCount: r._count.runs,
                    type: 'repo'
                })),
                runs: matchingRuns.map(run => ({
                    id: run.id,
                    githubRunId: run.githubRunId,
                    workflowName: run.workflowName,
                    branch: run.branch,
                    status: run.status,
                    commitSha: run.commitSha.substring(0, 7),
                    actor: run.actor,
                    createdAt: run.createdAt,
                    repo: `${run.repo.owner}/${run.repo.name}`,
                    priority: run.analysis?.priority,
                    type: 'run'
                }))
            });
        } catch (error) {
            console.error('Search error:', error);
            res.status(500).json({ error: 'Failed to search' });
        }
    }
};
