import crypto from 'crypto';

export function verifyGithubSignature(req, res, next) {
  const signature = req.headers['x-hub-signature-256'];
  if (!signature) {
    return res.status(401).send('Signature required');
  }

  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  const hmac = crypto.createHmac('sha256', secret);
  const rawBody = req.rawBody;
  if (!rawBody) {
    return res.status(400).send('Request body is missing');
  }
  const digest = 'sha256=' + hmac.update(rawBody).digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest))) {
    return res.status(401).send('Invalid signature');
  }

  next();
}
