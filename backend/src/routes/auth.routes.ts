import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';

const router = Router();

router.get('/github/login', AuthController.githubLogin);
router.get('/github', AuthController.githubLogin); // backward compat
router.get('/github/callback', AuthController.githubCallback);
router.get('/me', AuthController.me);
router.post('/logout', AuthController.logout);

export default router;
