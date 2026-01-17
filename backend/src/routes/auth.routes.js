import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';

const router = Router();

// GitHub OAuth (for login/signup)
router.get('/github/login', AuthController.githubLogin);
router.get('/github', AuthController.githubLogin); // backward compat
router.get('/github/callback', AuthController.githubCallback);

// GitHub Account Linking (for email users to connect GitHub)
// Uses same callback URL, but with state parameter to differentiate
router.get('/github/link', AuthController.githubLink);

// Email/Password Auth
router.post('/signup', AuthController.signup);
router.post('/login', AuthController.login);

// Common
router.get('/me', AuthController.me);
router.post('/logout', AuthController.logout);

export default router;
