import express from 'express';
import { InsightsController } from '../controllers/insights.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = express.Router();

// All insights routes require authentication
router.use(authMiddleware);

// GET /api/insights - List all insights
router.get('/', InsightsController.list);

// GET /api/insights/summary - Get summary counts
router.get('/summary', InsightsController.getSummary);

export default router;
