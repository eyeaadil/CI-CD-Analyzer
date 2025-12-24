import { Router } from 'express';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { signJwt, verifyJwt } from '../utils/jwt.js';

const router = Router();
const prisma = new PrismaClient();
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const GITHUB_CALLBACK_URL = process.env.GITHUB_CALLBACK_URL || 'http://localhost:3001/auth/github/callback';

// Start GitHub OAuth (JWT-based, no Passport)
router.get('/github/login', (req, res) => {
  const scope = encodeURIComponent('read:user user:email repo');
  const redirect = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(GITHUB_CALLBACK_URL)}&scope=${scope}`;
  return res.redirect(302, redirect);
});

// Backward-compat for old link
router.get('/github', (req, res) => {
  const scope = encodeURIComponent('read:user user:email repo');
  const redirect = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(GITHUB_CALLBACK_URL)}&scope=${scope}`;
  return res.redirect(302, redirect);
});

// GitHub OAuth callback -> exchange code, upsert user, return JWT by frontend redirect
router.get('/github/callback', async (req, res) => {
  try {
    const code = req.query.code;
    if (!code) {
      return res.status(400).send('Missing OAuth code');
    }

    // 1) Exchange code for access token
    const tokenResp = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: GITHUB_CALLBACK_URL,
      },
      { headers: { Accept: 'application/json' } }
    );
    const accessToken = tokenResp.data.access_token;
    if (!accessToken) {
      return res.status(401).send('Failed to obtain access token');
    }

    // 2) Get GitHub user profile
    const ghUserResp = await axios.get('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'ci-cd-failure-analyzer',
        Accept: 'application/vnd.github+json',
      },
    });

    const gh = ghUserResp.data;

    // 3) Upsert local user via Prisma (store access token for repo sync)
    const user = await prisma.user.upsert({
      where: { githubId: String(gh.id) },
      update: {
        username: gh.login,
        avatarUrl: gh.avatar_url,
        githubAccessToken: accessToken  // Store token for repo access
      },
      create: {
        githubId: String(gh.id),
        username: gh.login,
        avatarUrl: gh.avatar_url,
        githubAccessToken: accessToken  // Store token for repo access
      },
    });

    // 4) Issue JWT
    const token = signJwt({ sub: String(user.id), username: user.username });

    // 5) Redirect back to frontend with token
    const target = `${FRONTEND_URL}/auth/callback?token=${encodeURIComponent(token)}`;
    return res.redirect(302, target);
  } catch (err) {
    console.error('GitHub OAuth callback error:', err);
    return res.status(500).send('OAuth callback failed');
  }
});

// Get current user from JWT
router.get('/me', async (req, res) => {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : undefined;
    if (!token) return res.status(401).json({ message: 'Missing token' });

    const payload = verifyJwt(token);
    const user = await prisma.user.findUnique({ where: { id: Number(payload.sub) } });
    if (!user) return res.status(401).json({ message: 'Invalid token' });
    return res.json(user);
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }
});

// No-op for JWT – client should discard the token
router.post('/logout', (_req, res) => {
  return res.status(200).json({ message: 'Logged out. Discard token on client.' });
});

export default router;
