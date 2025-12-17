import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { signJwt, verifyJwt } from '../utils/jwt.js';

const prisma = new PrismaClient();
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const GITHUB_CALLBACK_URL = process.env.GITHUB_CALLBACK_URL || 'http://localhost:3001/auth/github/callback';

export const AuthController = {
  githubLogin: (req, res) => {
    const scope = encodeURIComponent('read:user user:email repo');
    const redirect = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(GITHUB_CALLBACK_URL)}&scope=${scope}`;
    return res.redirect(302, redirect);
  },

  githubCallback: async (req, res) => {
    try {
      const code = req.query.code;
      if (!code) {
        return res.status(400).send('Missing OAuth code');
      }

      // Exchange code for access token
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

      // Fetch user profile
      const ghUserResp = await axios.get('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': 'ci-cd-failure-analyzer',
          Accept: 'application/vnd.github+json',
        },
      });

      const gh = ghUserResp.data;

      // Upsert user
      const user = await prisma.user.upsert({
        where: { githubId: String(gh.id) },
        update: { username: gh.login, avatarUrl: gh.avatar_url },
        create: { githubId: String(gh.id), username: gh.login, avatarUrl: gh.avatar_url },
      });

      // Issue JWT - convert user.id to string for JWT sub
      const token = signJwt({ sub: String(user.id), username: user.username });

      const target = `${FRONTEND_URL}/auth/callback?token=${encodeURIComponent(token)}`;
      return res.redirect(302, target);
    } catch (err) {
      console.error('GitHub OAuth callback error:', err);
      return res.status(500).send('OAuth callback failed');
    }
  },

  me: async (req, res) => {
    try {
      const auth = req.headers.authorization || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : undefined;
      if (!token) return res.status(401).json({ message: 'Missing token' });

      const payload = verifyJwt(token);
      const user = await prisma.user.findUnique({ where: { id: parseInt(payload.sub) } });
      if (!user) return res.status(401).json({ message: 'Invalid token' });
      return res.json(user);
    } catch {
      return res.status(401).json({ message: 'Invalid token' });
    }
  },

  logout: (_req, res) => {
    return res.status(200).json({ message: 'Logged out. Discard token on client.' });
  },
};
