import { Router } from 'express';
import { RepoController } from '../controllers/repo.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.get('/', authenticate, RepoController.list);
router.post('/sync', authenticate, RepoController.sync);

export default router;
