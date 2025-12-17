import { Router } from 'express';
import { RepoController } from '../controllers/repo.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/', authenticate, RepoController.list);
router.post('/sync', authenticate, RepoController.sync);

export default router;
