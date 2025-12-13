import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const RepoController = {
    // List all repos for the authenticated user
    list: async (req: Request, res: Response) => {
        try {
            const userId = (req as any).user?.id;
            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const repos = await prisma.repo.findMany({
                where: { userId: Number(userId) },
                orderBy: { updatedAt: 'desc' },
            });

            return res.json(repos);
        } catch (error) {
            console.error('Error listing repos:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    },

    // Sync repos - for MVP we can leave this as a placeholder or basic impl
    sync: async (req: Request, res: Response) => {
        return res.status(501).json({ message: 'Sync not implemented yet' });
    }
};
