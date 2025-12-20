import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const RepoController = {
    /**
     * GET /api/repos
     * List all repos for the authenticated user with stats
     */
    list: async (req, res) => {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const repos = await prisma.repo.findMany({
                where: { userId: Number(userId) },
                orderBy: { updatedAt: 'desc' },
                include: {
                    _count: {
                        select: { runs: true }
                    }
                }
            });

            // Get failure counts for each repo
            const reposWithStats = await Promise.all(repos.map(async (repo) => {
                const last7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

                const [failureCount, totalCount] = await Promise.all([
                    prisma.workflowRun.count({
                        where: {
                            repoId: repo.id,
                            status: 'failure',
                            createdAt: { gte: last7d }
                        }
                    }),
                    prisma.workflowRun.count({
                        where: {
                            repoId: repo.id,
                            createdAt: { gte: last7d }
                        }
                    })
                ]);

                const failureRate = totalCount > 0 ? ((failureCount / totalCount) * 100).toFixed(1) : 0;

                return {
                    id: repo.id,
                    name: repo.name,
                    owner: repo.owner,
                    fullName: `${repo.owner}/${repo.name}`,
                    isPrivate: repo.isPrivate,
                    createdAt: repo.createdAt,
                    updatedAt: repo.updatedAt,
                    totalRuns: repo._count.runs,
                    failureCount7d: failureCount,
                    totalRuns7d: totalCount,
                    failureRate7d: parseFloat(failureRate)
                };
            }));

            return res.json(reposWithStats);
        } catch (error) {
            console.error('Error listing repos:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    },

    /**
     * GET /api/repos/:id
     * Get single repo with detailed stats
     */
    getById: async (req, res) => {
        try {
            const userId = req.user?.id;
            const repoId = parseInt(req.params.id);

            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const repo = await prisma.repo.findFirst({
                where: {
                    id: repoId,
                    userId: Number(userId)
                },
                include: {
                    _count: {
                        select: { runs: true }
                    }
                }
            });

            if (!repo) {
                return res.status(404).json({ error: 'Repository not found' });
            }

            // Get detailed stats
            const last30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            const last7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

            const [
                failureCount30d,
                totalCount30d,
                recentRuns,
                priorityDistribution
            ] = await Promise.all([
                prisma.workflowRun.count({
                    where: { repoId, status: 'failure', createdAt: { gte: last30d } }
                }),
                prisma.workflowRun.count({
                    where: { repoId, createdAt: { gte: last30d } }
                }),
                prisma.workflowRun.findMany({
                    where: { repoId },
                    orderBy: { createdAt: 'desc' },
                    take: 5,
                    include: {
                        analysis: {
                            select: { priority: true, failureType: true }
                        }
                    }
                }),
                prisma.analysisResult.groupBy({
                    by: ['priority'],
                    where: {
                        workflowRun: { repoId, createdAt: { gte: last30d } }
                    },
                    _count: true
                })
            ]);

            const failureRate = totalCount30d > 0 ? ((failureCount30d / totalCount30d) * 100).toFixed(1) : 0;

            // Calculate health score (0-100)
            const healthScore = Math.max(0, 100 - parseFloat(failureRate));

            return res.json({
                id: repo.id,
                name: repo.name,
                owner: repo.owner,
                fullName: `${repo.owner}/${repo.name}`,
                isPrivate: repo.isPrivate,
                createdAt: repo.createdAt,
                updatedAt: repo.updatedAt,
                stats: {
                    totalRuns: repo._count.runs,
                    failureCount30d,
                    totalRuns30d: totalCount30d,
                    failureRate30d: parseFloat(failureRate),
                    healthScore: Math.round(healthScore)
                },
                priorityDistribution: priorityDistribution.map(p => ({
                    priority: p.priority,
                    count: p._count
                })),
                recentRuns: recentRuns.map(run => ({
                    id: run.id,
                    githubRunId: run.githubRunId,
                    workflowName: run.workflowName,
                    status: run.status,
                    branch: run.branch,
                    createdAt: run.createdAt,
                    priority: run.analysis?.priority,
                    failureType: run.analysis?.failureType
                }))
            });
        } catch (error) {
            console.error('Error getting repo:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    },

    /**
     * GET /api/repos/:id/runs
     * Get runs for a repo with filtering
     */
    getRuns: async (req, res) => {
        try {
            const userId = req.user?.id;
            const repoId = parseInt(req.params.id);

            // Query params
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 20;
            const status = req.query.status; // 'failure', 'success', 'all'
            const branch = req.query.branch;
            const priority = req.query.priority ? parseInt(req.query.priority) : undefined;

            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            // Verify repo belongs to user
            const repo = await prisma.repo.findFirst({
                where: { id: repoId, userId: Number(userId) }
            });

            if (!repo) {
                return res.status(404).json({ error: 'Repository not found' });
            }

            // Build where clause
            const where = { repoId };
            if (status && status !== 'all') {
                where.status = status;
            }
            if (branch) {
                where.branch = branch;
            }
            if (priority !== undefined) {
                where.analysis = { priority };
            }

            const [runs, total] = await Promise.all([
                prisma.workflowRun.findMany({
                    where,
                    orderBy: { createdAt: 'desc' },
                    skip: (page - 1) * limit,
                    take: limit,
                    include: {
                        analysis: {
                            select: {
                                rootCause: true,
                                failureStage: true,
                                priority: true,
                                failureType: true,
                                usedAI: true
                            }
                        }
                    }
                }),
                prisma.workflowRun.count({ where })
            ]);

            return res.json({
                runs: runs.map(run => ({
                    id: run.id,
                    githubRunId: run.githubRunId,
                    workflowName: run.workflowName,
                    status: run.status,
                    branch: run.branch,
                    actor: run.actor,
                    commitSha: run.commitSha.substring(0, 7),
                    runUrl: run.runUrl,
                    createdAt: run.createdAt,
                    analysis: run.analysis ? {
                        rootCause: run.analysis.rootCause.substring(0, 100) + '...',
                        failureStage: run.analysis.failureStage,
                        priority: run.analysis.priority,
                        failureType: run.analysis.failureType,
                        usedAI: run.analysis.usedAI
                    } : null
                })),
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit)
                }
            });
        } catch (error) {
            console.error('Error getting runs:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    },

    /**
     * POST /api/repos/sync
     * Sync repos from GitHub - placeholder
     */
    sync: async (req, res) => {
        return res.status(501).json({ message: 'Sync not implemented yet' });
    }
};

