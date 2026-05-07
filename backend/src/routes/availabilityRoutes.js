import express from 'express';
import {
  getProviderAvailability,
  getProviderAvailabilityRange,
} from '../controllers/availabilityController.js';

const router = express.Router();

// Public routes — no auth required
router.get('/:providerId',       getProviderAvailability);        // ?date=YYYY-MM-DD
router.get('/:providerId/range', getProviderAvailabilityRange);  // ?start=...&end=...

export default router;