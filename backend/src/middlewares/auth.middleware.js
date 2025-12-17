import { verifyJwt } from '../utils/jwt.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Missing or invalid token' });
        }

        const token = authHeader.split(' ')[1];
        const payload = verifyJwt(token);

        if (!payload || !payload.sub) {
            return res.status(401).json({ error: 'Invalid token payload' });
        }

        // Optionally fetch full user if needed, or just pass the ID
        // For safety, let's check user exists
        const user = await prisma.user.findUnique({
            where: { id: Number(payload.sub) } // Ensure ID is number as per schema
        });

        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        return res.status(401).json({ error: 'Authentication failed' });
    }
};
