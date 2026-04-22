import express from 'express';
import { getProviderDashboard } from '../controllers/dashboardController.js';
import { authenticate, requireRole } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get(
  '/provider',
  authenticate,
  requireRole('provider'),
  getProviderDashboard,
);

export default router;
