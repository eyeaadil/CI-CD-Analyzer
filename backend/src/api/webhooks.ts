import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logProcessingQueue } from '../queues/logProcessingQueue';

const router = Router();

// Middleware to verify the webhook signature
const verifySignature = (req: Request, res: Response, next: NextFunction) => {
  const signature = req.headers['x-hub-signature-256'] as string;
  if (!signature) {
    return res.status(401).send('Signature required');
  }

  const hmac = crypto.createHmac('sha256', process.env.GITHUB_WEBHOOK_SECRET!);
  // We need the raw body for the signature verification, so we use a custom buffer
  const rawBody = req.rawBody;
  if (!rawBody) {
    return res.status(400).send('Request body is missing');
  }
  const digest = 'sha256=' + hmac.update(rawBody).digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest))) {
    return res.status(401).send('Invalid signature');
  }

  next();
};

router.post('/github', verifySignature, (req: Request, res: Response) => {
  const event = req.headers['x-github-event'] as string;
  const payload = req.body;

  console.log(`Received GitHub webhook event: ${event}`);

  if (event === 'workflow_run') {
    // We only care about completed, failed runs
    if (payload.action === 'completed' && payload.workflow_run.conclusion === 'failure') {
      console.log('--- Workflow Run Failed ---');
      console.log(`Repo: ${payload.repository.full_name}`);
      console.log(`Run ID: ${payload.workflow_run.id}`);
      // Dispatch a job to the queue
      logProcessingQueue.add('process-log', {
        repoFullName: payload.repository.full_name,
        runId: payload.workflow_run.id,
        installationId: payload.installation.id,
      });
      console.log(`Dispatched job for run ID: ${payload.workflow_run.id}`);
    }
  }

  res.status(200).send('Event received');
});

export default router;
