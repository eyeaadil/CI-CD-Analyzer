import { Router } from 'express';
import { RepoController } from '../controllers/repo.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

// GET /api/repos - List all repos with stats
router.get('/', authenticate, RepoController.list);

// GET /api/repos/:id - Get single repo with detailed stats
router.get('/:id', authenticate, RepoController.getById);

// GET /api/repos/:id/runs - Get runs for a repo with filtering
router.get('/:id/runs', authenticate, RepoController.getRuns);

// POST /api/repos/sync - Sync repos from GitHub
router.post('/sync', authenticate, RepoController.sync);

export default router;

