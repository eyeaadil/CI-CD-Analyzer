import { Request, Response } from 'express';
import { logProcessingQueue } from '../queues/logProcessingQueue';

export const WebhooksController = {
  github: async (req: Request, res: Response) => {
    const event = req.headers['x-github-event'] as string;
    const payload = req.body as any;

    console.log(`Received GitHub webhook event: ${event}`);

    if (event === 'workflow_run') {
      if (payload.action === 'completed' && payload.workflow_run?.conclusion === 'failure') {
        console.log('--- Workflow Run Failed ---');
        console.log(`Repo: ${payload.repository?.full_name}`);
        console.log(`Run ID: ${payload.workflow_run?.id}`);

        await logProcessingQueue.add('process-log', {
          repoFullName: payload.repository.full_name,
          runId: payload.workflow_run.id,
          installationId: payload.installation.id,
        });
        console.log(`Dispatched job for run ID: ${payload.workflow_run.id}`);
      }
    }

    return res.status(200).send('Event received');
  },
};
