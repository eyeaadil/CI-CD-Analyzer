import { PrismaClient } from '@prisma/client';
import { VectorSearchService } from '../services/vectorSearch.js';

const prisma = new PrismaClient();
const vectorSearch = new VectorSearchService();

export const RunController = {
    /**
     * GET /api/runs/:id
     * Get full run detail with analysis
     */
    getById: async (req, res) => {
        try {
            const runId = parseInt(req.params.id);
            const userId = req.user?.id;

            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const run = await prisma.workflowRun.findUnique({
                where: { id: runId },
                include: {
                    repo: {
                        select: { id: true, name: true, owner: true, userId: true }
                    },
                    analysis: true,
                    chunks: {
                        orderBy: { chunkIndex: 'asc' },
                        select: {
                            id: true,
                            chunkIndex: true,
                            stepName: true,
                            hasErrors: true,
                            errorCount: true,
                            startLine: true,
                            endLine: true
                        }
                    }
                }
            });

            if (!run) {
                return res.status(404).json({ error: 'Run not found' });
            }

            if (run.repo.userId !== Number(userId)) {
                return res.status(403).json({ error: 'Access denied' });
            }

            // Parse detected errors if stored as JSON string
            let detectedErrors = [];
            if (run.analysis?.detectedErrors) {
                try {
                    detectedErrors = typeof run.analysis.detectedErrors === 'string'
                        ? JSON.parse(run.analysis.detectedErrors)
                        : run.analysis.detectedErrors;
                } catch (e) {
                    detectedErrors = [];
                }
            }

            return res.json({
                id: run.id,
                githubRunId: run.githubRunId,
                workflowName: run.workflowName,
                status: run.status,
                triggerEvent: run.triggerEvent,
                commitSha: run.commitSha,
                branch: run.branch,
                actor: run.actor,
                runUrl: run.runUrl,
                createdAt: run.createdAt,
                repo: {
                    id: run.repo.id,
                    name: run.repo.name,
                    owner: run.repo.owner,
                    fullName: `${run.repo.owner}/${run.repo.name}`
                },
                analysis: run.analysis ? {
                    id: run.analysis.id,
                    rootCause: run.analysis.rootCause,
                    failureStage: run.analysis.failureStage,
                    suggestedFix: run.analysis.suggestedFix,
                    priority: run.analysis.priority,
                    failureType: run.analysis.failureType,
                    usedAI: run.analysis.usedAI,
                    detectedErrors,
                    createdAt: run.analysis.createdAt
                } : null,
                chunks: run.chunks.map(chunk => ({
                    id: chunk.id,
                    index: chunk.chunkIndex,
                    stepName: chunk.stepName,
                    hasErrors: chunk.hasErrors,
                    errorCount: chunk.errorCount,
                    lineRange: `${chunk.startLine}-${chunk.endLine}`
                })),
                totalChunks: run.chunks.length,
                totalErrors: run.chunks.reduce((sum, c) => sum + c.errorCount, 0)
            });
        } catch (error) {
            console.error('Error getting run:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    },

    /**
     * GET /api/runs/:id/logs
     * Get log chunks for a run
     */
    getLogs: async (req, res) => {
        try {
            const runId = parseInt(req.params.id);
            const userId = req.user?.id;
            const chunkIndex = req.query.chunk ? parseInt(req.query.chunk) : undefined;

            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const run = await prisma.workflowRun.findUnique({
                where: { id: runId },
                include: {
                    repo: { select: { userId: true } }
                }
            });

            if (!run) {
                return res.status(404).json({ error: 'Run not found' });
            }

            if (run.repo.userId !== Number(userId)) {
                return res.status(403).json({ error: 'Access denied' });
            }

            // Get chunks
            const where = { workflowRunId: runId };
            if (chunkIndex !== undefined) {
                where.chunkIndex = chunkIndex;
            }

            const chunks = await prisma.logChunk.findMany({
                where,
                orderBy: { chunkIndex: 'asc' },
                select: {
                    id: true,
                    chunkIndex: true,
                    stepName: true,
                    content: true,
                    startLine: true,
                    endLine: true,
                    hasErrors: true,
                    errorCount: true
                }
            });

            return res.json({
                runId,
                chunks: chunks.map(chunk => ({
                    id: chunk.id,
                    index: chunk.chunkIndex,
                    stepName: chunk.stepName,
                    content: chunk.content,
                    lineRange: { start: chunk.startLine, end: chunk.endLine },
                    hasErrors: chunk.hasErrors,
                    errorCount: chunk.errorCount
                })),
                totalChunks: chunks.length
            });
        } catch (error) {
            console.error('Error getting logs:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    },

    /**
     * GET /api/runs/:id/similar
     * Get similar past failures using vector search
     */
    getSimilar: async (req, res) => {
        try {
            const runId = parseInt(req.params.id);
            const userId = req.user?.id;
            const limit = parseInt(req.query.limit) || 5;

            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const run = await prisma.workflowRun.findUnique({
                where: { id: runId },
                include: {
                    repo: { select: { userId: true } },
                    analysis: { select: { rootCause: true } },
                    chunks: {
                        where: { hasErrors: true },
                        take: 3,
                        select: { id: true, content: true }
                    }
                }
            });

            if (!run) {
                return res.status(404).json({ error: 'Run not found' });
            }

            if (run.repo.userId !== Number(userId)) {
                return res.status(403).json({ error: 'Access denied' });
            }

            // Find similar failures using vector search
            let similarRuns = [];

            if (run.chunks.length > 0) {
                try {
                    // Use first error chunk to find similar
                    const similarChunks = await vectorSearch.findSimilarChunks(
                        run.chunks[0].id,
                        limit + 1 // +1 to exclude self
                    );

                    // Get unique workflow runs from similar chunks
                    const seenRunIds = new Set([runId]);
                    for (const chunk of similarChunks) {
                        if (!seenRunIds.has(chunk.workflowRunId) && similarRuns.length < limit) {
                            seenRunIds.add(chunk.workflowRunId);

                            const similarRun = await prisma.workflowRun.findUnique({
                                where: { id: chunk.workflowRunId },
                                include: {
                                    repo: { select: { name: true, owner: true } },
                                    analysis: {
                                        select: { rootCause: true, failureStage: true, priority: true }
                                    }
                                }
                            });

                            if (similarRun) {
                                similarRuns.push({
                                    id: similarRun.id,
                                    githubRunId: similarRun.githubRunId,
                                    workflowName: similarRun.workflowName,
                                    repo: `${similarRun.repo.owner}/${similarRun.repo.name}`,
                                    createdAt: similarRun.createdAt,
                                    similarity: chunk.similarity || 0,
                                    analysis: similarRun.analysis ? {
                                        rootCause: similarRun.analysis.rootCause.substring(0, 100) + '...',
                                        failureStage: similarRun.analysis.failureStage,
                                        priority: similarRun.analysis.priority
                                    } : null
                                });
                            }
                        }
                    }
                } catch (error) {
                    console.warn('Vector search failed:', error.message);
                    // Fall back to empty array
                }
            }

            return res.json({
                runId,
                similarRuns,
                totalFound: similarRuns.length
            });
        } catch (error) {
            console.error('Error getting similar runs:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    },

    /**
     * GET /api/runs/repo/:repoId (deprecated - use /api/repos/:id/runs instead)
     * List runs for a specific repo
     */
    listByRepo: async (req, res) => {
        try {
            const { repoId } = req.params;
            const userId = req.user?.id;

            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const repo = await prisma.repo.findFirst({
                where: { id: Number(repoId), userId: Number(userId) }
            });

            if (!repo) {
                return res.status(404).json({ error: 'Repository not found' });
            }

            const runs = await prisma.workflowRun.findMany({
                where: { repoId: Number(repoId) },
                orderBy: { createdAt: 'desc' },
                take: 20,
                include: {
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

            return res.json(runs);
        } catch (error) {
            console.error('Error listing runs:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    },

    /**
     * GET /api/runs/:id/analysis (deprecated - use /api/runs/:id instead)
     */
    getAnalysis: async (req, res) => {
        try {
            const runId = parseInt(req.params.runId || req.params.id);
            const userId = req.user?.id;

            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const run = await prisma.workflowRun.findUnique({
                where: { id: runId },
                include: {
                    repo: { select: { userId: true } },
                    analysis: true
                }
            });

            if (!run) {
                return res.status(404).json({ error: 'Run not found' });
            }

            if (run.repo.userId !== Number(userId)) {
                return res.status(403).json({ error: 'Access denied' });
            }

            return res.json(run.analysis || { message: 'No analysis available yet' });
        } catch (error) {
            console.error('Error fetching analysis:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }
};

