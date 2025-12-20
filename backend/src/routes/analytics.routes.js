import express from 'express';
import { AnalyticsController } from '../controllers/analytics.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = express.Router();

// All analytics routes require authentication
router.use(authMiddleware);

// GET /api/analytics/trends - Failure trends over time
router.get('/trends', AnalyticsController.getTrends);

// GET /api/analytics/categories - Failures by category/priority
router.get('/categories', AnalyticsController.getCategories);

// GET /api/analytics/top-failures - Most common failure patterns
router.get('/top-failures', AnalyticsController.getTopFailures);

export default router;
