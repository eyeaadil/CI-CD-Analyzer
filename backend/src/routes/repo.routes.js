import { Router } from 'express';
import { RepoController } from '../controllers/repo.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

// GET /api/repos/available - Fetch GitHub repos for selection (without saving)
// Must be BEFORE /:id to prevent "available" being matched as an ID
router.get('/available', authenticate, RepoController.fetchAvailable);

// GET /api/repos - List all repos with stats
router.get('/', authenticate, RepoController.list);

// GET /api/repos/:id - Get single repo with detailed stats
router.get('/:id', authenticate, RepoController.getById);

// GET /api/repos/:id/runs - Get runs for a repo with filtering
router.get('/:id/runs', authenticate, RepoController.getRuns);

// POST /api/repos/sync - Import selected repos from GitHub
router.post('/sync', authenticate, RepoController.sync);

// DELETE /api/repos/:id - Remove repo from tracking
router.delete('/:id', authenticate, RepoController.remove);

export default router;

