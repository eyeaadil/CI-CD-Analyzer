import { Router } from 'express';
import { WebhooksController } from '../controllers/webhooks.controller.js';
import { verifyGithubSignature } from '../middlewares/verifyGithubSignature.js';

const router = Router();


console.log("WEBHOOKS ROUTES LOADED");
router.post('/github', verifyGithubSignature, WebhooksController.github);

export default router;
