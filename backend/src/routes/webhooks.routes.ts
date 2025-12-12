import { Router } from 'express';
import { WebhooksController } from '../controllers/webhooks.controller';
import { verifyGithubSignature } from '../middlewares/verifyGithubSignature';

const router = Router();

router.post('/github', verifyGithubSignature, WebhooksController.github);

export default router;
