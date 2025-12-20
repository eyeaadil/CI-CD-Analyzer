import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.routes.js';
import webhookRoutes from './routes/webhooks.routes.js';
import repoRoutes from './routes/repo.routes.js';
import runRoutes from './routes/run.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import userRoutes from './routes/user.routes.js';
import insightsRoutes from './routes/insights.routes.js';
import incidentsRoutes from './routes/incidents.routes.js';
import { LogParserService } from './services/logParser.js';
import { AIAnalyzerService } from './services/aiAnalyzer.js';

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

const app = express();
const port = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// 1. CORS for frontend (support multiple origins for development)
const allowedOrigins = [FRONTEND_URL, 'http://localhost:3000', 'http://localhost:5173'];
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, true); // Allow all in development
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// 2. Body parsers
// Custom JSON parser that also saves the raw body for webhook signature verification
app.use(express.json({
  verify: (req, res, buf) => {
    // Save raw body for webhook signature verification
    req.rawBody = buf.toString();
  }
}));
app.use(express.text({ type: 'text/plain', limit: '10mb' }));

// 3. API Routes
app.use('/auth', authRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/repos', repoRoutes);
app.use('/api/runs', runRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/user', userRoutes);
app.use('/api/insights', insightsRoutes);
app.use('/api/incidents', incidentsRoutes);

console.log('API ROUTES LOADED: /api/dashboard, /api/analytics, /api/user, /api/repos, /api/runs, /api/insights, /api/incidents');

app.get('/', (req, res) => {
  res.send('CI/CD Analyzer Backend is running.');
});

// The main analysis endpoint
app.post('/api/analyze', async (req, res) => {
  try {
    const rawLog = req.body;
    if (typeof rawLog !== 'string' || rawLog.length === 0) {
      return res.status(400).json({ error: 'Request body must be a non-empty string of raw logs.' });
    }

    const logParser = new LogParserService();
    const aiAnalyzer = new AIAnalyzerService();

    // 1. Parse the log
    const parsedResult = logParser.parse(rawLog);

    // 2. Get AI analysis
    const aiResult = await aiAnalyzer.analyzeFailure(
      parsedResult.steps,
      parsedResult.detectedErrors
    );

    // 3. Combine results and send response
    const finalAnalysis = {
      ...parsedResult,
      ...aiResult,
    };

    res.json(finalAnalysis);
  } catch (error) {
    console.error('Error during analysis:', error);
    res.status(500).json({ error: 'An internal server error occurred.' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
