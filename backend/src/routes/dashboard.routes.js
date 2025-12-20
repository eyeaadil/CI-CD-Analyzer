import express from 'express';
import { DashboardController } from '../controllers/dashboard.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = express.Router();

// All dashboard routes require authentication
router.use(authMiddleware);

// GET /api/dashboard/stats - Overview metrics
router.get('/stats', DashboardController.getStats);

// GET /api/dashboard/recent - Recent failed runs
router.get('/recent', DashboardController.getRecentFailures);

// GET /api/dashboard/activity - Activity timeline
router.get('/activity', DashboardController.getActivity);

// GET /api/dashboard/search - Search repos and runs
router.get('/search', DashboardController.search);

export default router;
