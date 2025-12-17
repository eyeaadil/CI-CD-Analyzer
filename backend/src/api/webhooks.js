import { Router } from 'express';
import crypto from 'crypto';
import { logProcessingQueue } from '../queues/logProcessingQueue.js';

const router = Router();

// Middleware to verify the webhook signature
const verifySignature = (req, res, next) => {
  const signature = req.headers['x-hub-signature-256'];
  if (!signature) {
    return res.status(401).send('Signature required');
  }

  const hmac = crypto.createHmac('sha256', process.env.GITHUB_WEBHOOK_SECRET);
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

router.post('/github', verifySignature, async (req, res) => {
  const event = req.headers['x-github-event'];
  const payload = req.body;

  console.log(`Received GitHub webhook event: ${event}`);

  if (event === 'workflow_run') {
    // We only care about completed, failed runs
    if (payload.action === 'completed' && payload.workflow_run.conclusion === 'failure') {
      console.log('--- Workflow Run Failed ---');
      const { workflow_run, installation } = payload;
      console.log(`Repo: ${workflow_run.repository.full_name}`);
      console.log(`Run ID: ${workflow_run.id}`);

      // Queue job for log processing
      // Don't use jobId to allow re-analyzing the same workflow
      await logProcessingQueue.add('log-processing', {
        repoFullName: workflow_run.repository.full_name,
        runId: workflow_run.id,
        installationId: installation.id
      }, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        },
        removeOnComplete: true,
        removeOnFail: false
      });
      console.log(`✅ Dispatched job for run ID: ${workflow_run.id}`);
    }
  }

  res.status(200).send('Event received');
});

export default router;
