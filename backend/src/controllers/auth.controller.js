/**
 * Auth Controller
 * 
 * Handles both:
 * - GitHub OAuth
 * - Email/Password authentication
 */

import axios from 'axios';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { signJwt, verifyJwt } from '../utils/jwt.js';
import { config } from '../config.js';

const prisma = new PrismaClient();

// Use config values (already loaded from .env)
const FRONTEND_URL = config.FRONTEND_URL;
const GITHUB_CLIENT_ID = config.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = config.GITHUB_CLIENT_SECRET;
const GITHUB_CALLBACK_URL = config.GITHUB_CALLBACK_URL;

export const AuthController = {
  // ================================
  // GitHub OAuth
  // ================================
  githubLogin: (req, res) => {
    console.log('GitHub OAuth - Client ID:', GITHUB_CLIENT_ID);
    const scope = encodeURIComponent('read:user user:email repo');
    const redirect = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(GITHUB_CALLBACK_URL)}&scope=${scope}`;
    return res.redirect(302, redirect);
  },

  githubCallback: async (req, res) => {
    try {
      const code = req.query.code;
      if (!code) {
        return res.redirect(`${FRONTEND_URL}/login?error=Missing OAuth code`);
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
        return res.redirect(`${FRONTEND_URL}/login?error=Failed to get access token`);
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

      // Upsert user (including GitHub access token for API calls)
      const user = await prisma.user.upsert({
        where: { githubId: String(gh.id) },
        update: { 
          username: gh.login, 
          avatarUrl: gh.avatar_url,
          githubAccessToken: accessToken,
        },
        create: {
          githubId: String(gh.id),
          username: gh.login,
          avatarUrl: gh.avatar_url,
          name: gh.name,
          githubAccessToken: accessToken,
        },
      });

      // Issue JWT
      const token = signJwt({ sub: String(user.id), username: user.username });
      return res.redirect(`${FRONTEND_URL}/auth/callback?token=${encodeURIComponent(token)}`);
    } catch (err) {
      console.error('GitHub OAuth callback error:', err);
      return res.redirect(`${FRONTEND_URL}/login?error=OAuth failed`);
    }
  },

  // ================================
  // Email/Password Authentication
  // ================================
  signup: async (req, res) => {
    try {
      const { name, email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
      }

      if (password.length < 8) {
        return res.status(400).json({ message: 'Password must be at least 8 characters' });
      }

      const existingUser = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
      });

      if (existingUser) {
        return res.status(400).json({ message: 'Email already registered' });
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const user = await prisma.user.create({
        data: {
          email: email.toLowerCase(),
          passwordHash,
          name: name || email.split('@')[0],
          username: email.split('@')[0],
        },
      });

      const token = signJwt({ sub: String(user.id), username: user.username });

      return res.status(201).json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          username: user.username,
          avatarUrl: user.avatarUrl,
        },
        token,
      });
    } catch (err) {
      console.error('Signup error:', err);
      return res.status(500).json({ message: 'Signup failed' });
    }
  },

  login: async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
      }

      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
      });

      if (!user || !user.passwordHash) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }

      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }

      const token = signJwt({ sub: String(user.id), username: user.username });

      return res.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          username: user.username,
          avatarUrl: user.avatarUrl,
        },
        token,
      });
    } catch (err) {
      console.error('Login error:', err);
      return res.status(500).json({ message: 'Login failed' });
    }
  },

  // ================================
  // Common
  // ================================
  me: async (req, res) => {
    try {
      const auth = req.headers.authorization || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : undefined;
      if (!token) return res.status(401).json({ message: 'Missing token' });

      const payload = verifyJwt(token);
      const user = await prisma.user.findUnique({ where: { id: parseInt(payload.sub) } });
      if (!user) return res.status(401).json({ message: 'Invalid token' });

      return res.json({
        id: user.id,
        email: user.email,
        name: user.name,
        username: user.username,
        avatarUrl: user.avatarUrl,
        githubId: user.githubId,
      });
    } catch {
      return res.status(401).json({ message: 'Invalid token' });
    }
  },

  logout: (_req, res) => {
    return res.status(200).json({ message: 'Logged out. Discard token on client.' });
  },
};
