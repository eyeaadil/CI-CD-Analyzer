// Import config FIRST to load env vars
import './config.js';

// Now import everything else
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

const app = express();
const port = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:8080';

// 1. CORS for frontend
const allowedOrigins = [FRONTEND_URL, 'http://localhost:3000', 'http://localhost:5173', 'http://localhost:8080'];
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  })
);

// 2. Body parsers - with rawBody capture for webhook signature verification
app.use(express.json({
  limit: '50mb',
  verify: (req, res, buf) => {
    // Store raw body for GitHub webhook signature verification
    req.rawBody = buf;
  }
}));

// 3. Health check
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));
app.get('/', (req, res) => res.status(200).json({ message: 'CI/CD Failure Analyzer API' }));

// 4. Auth and webhook routes
app.use('/auth', authRoutes);
app.use('/api/webhooks', webhookRoutes);
console.log('WEBHOOKS ROUTES LOADED');

// 5. API routes
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/user', userRoutes);
app.use('/api/repos', repoRoutes);
app.use('/api/runs', runRoutes);
app.use('/api/insights', insightsRoutes);
app.use('/api/incidents', incidentsRoutes);
console.log('API ROUTES LOADED: /api/dashboard, /api/analytics, /api/user, /api/repos, /api/runs, /api/insights, /api/incidents');

// 6. Global log analysis endpoint
const logParser = new LogParserService();
const aiAnalyzer = new AIAnalyzerService();

app.post('/api/analyze', async (req, res) => {
  try {
    const { rawLog, context } = req.body;
    if (!rawLog) {
      return res.status(400).json({ error: 'rawLog is required' });
    }
    const parsedLog = logParser.parse(rawLog);
    const analysis = await aiAnalyzer.analyze(parsedLog, context || {});
    return res.json({ success: true, parsed: parsedLog, analysis });
  } catch (err) {
    console.error('Analysis error:', err);
    return res.status(500).json({ error: 'Analysis failed', message: err.message });
  }
});

// 7. Global 404 handler
app.use((req, res) => {
  console.log('404 Not Found:', req.method, req.url);
  res.status(404).json({ error: 'Not Found', path: req.url });
});

// 8. Global error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Start server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
