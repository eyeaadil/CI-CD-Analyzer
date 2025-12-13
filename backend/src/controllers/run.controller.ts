import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const RunController = {
    // List runs for a specific repo
    listByRepo: async (req: Request, res: Response) => {
        try {
            const { repoId } = req.params;
            const userId = (req as any).user?.id;

            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            // Check if user owns the repo
            const repo = await prisma.repo.findFirst({
                where: { id: Number(repoId), userId: Number(userId) },
            });

            if (!repo) {
                return res.status(404).json({ error: 'Repository not found or access denied' });
            }

            const runs = await prisma.workflowRun.findMany({
                where: { repoId: Number(repoId) },
                orderBy: { createdAt: 'desc' },
                take: 20, // Pagination limit
                include: {
                    analysis: {
                        select: {
                            id: true,
                            rootCause: true,
                            failureStage: true
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

    // Get detailed analysis for a run
    getAnalysis: async (req: Request, res: Response) => {
        try {
            const { runId } = req.params;
            const userId = (req as any).user?.id;

            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            // Ensure the run belongs to a repo owned by the user
            const run = await prisma.workflowRun.findUnique({
                where: { id: Number(runId) },
                include: {
                    repo: true,
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
