import express from 'express';
import { IncidentsController } from '../controllers/incidents.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = express.Router();

// All incidents routes require authentication
router.use(authMiddleware);

// GET /api/incidents - List all incidents
router.get('/', IncidentsController.list);

// GET /api/incidents/stats - Get incident statistics
router.get('/stats', IncidentsController.getStats);

// GET /api/incidents/:id - Get single incident
router.get('/:id', IncidentsController.getById);

export default router;
