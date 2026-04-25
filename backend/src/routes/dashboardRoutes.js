import express from 'express';
import { getProviderDashboard } from '../controllers/dashboardController.js';
import { getCustomerDashboard } from '../controllers/customerDashboardController.js';
import { authenticate, requireRole } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get(
  '/provider',
  authenticate,
  requireRole('provider'),
  getProviderDashboard,
);

router.get(
  '/customer',
  authenticate,
  getCustomerDashboard,
);

export default router;
