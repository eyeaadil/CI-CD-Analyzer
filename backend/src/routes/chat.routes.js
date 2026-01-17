import express from 'express';
import { ChatController } from '../controllers/chat.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Chat with logs
router.post('/', authenticate, ChatController.chat);

export default router;
