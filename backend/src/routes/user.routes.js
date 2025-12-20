import express from 'express';
import { SettingsController } from '../controllers/settings.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = express.Router();

// All settings routes require authentication
router.use(authMiddleware);

// GET /api/user/settings - Get user settings
router.get('/settings', SettingsController.getSettings);

// PUT /api/user/settings - Update user settings
router.put('/settings', SettingsController.updateSettings);

export default router;
