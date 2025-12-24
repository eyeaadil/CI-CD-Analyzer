import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';

const router = Router();

// GitHub OAuth
router.get('/github/login', AuthController.githubLogin);
router.get('/github', AuthController.githubLogin); // backward compat
router.get('/github/callback', AuthController.githubCallback);

// Email/Password Auth
router.post('/signup', AuthController.signup);
router.post('/login', AuthController.login);

// Common
router.get('/me', AuthController.me);
router.post('/logout', AuthController.logout);

export default router;
