import { Router } from 'express';
import { RunController } from '../controllers/run.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

// GET /api/runs/:id - Get full run detail with analysis
router.get('/:id', authenticate, RunController.getById);

// GET /api/runs/:id/logs - Get log chunks for a run
router.get('/:id/logs', authenticate, RunController.getLogs);

// GET /api/runs/:id/similar - Get similar past failures
router.get('/:id/similar', authenticate, RunController.getSimilar);

// GET /api/runs/:id/analysis - Get analysis (deprecated, use /:id instead)
router.get('/:id/analysis', authenticate, RunController.getAnalysis);

// GET /api/runs/repo/:repoId - List runs by repo (deprecated, use /api/repos/:id/runs)
router.get('/repo/:repoId', authenticate, RunController.listByRepo);

export default router;

