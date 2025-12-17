import { Router } from 'express';
import { RunController } from '../controllers/run.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

// List runs for a specific repo
router.get('/repo/:repoId', authenticate, RunController.listByRepo);

// Get analysis for a specific run
router.get('/:runId/analysis', authenticate, RunController.getAnalysis);

export default router;
