import express from 'express';
import { createReview, getProviderReviews, getServiceReviews } from '../controllers/reviewController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public — service-level aggregate reviews (must be before /:providerId to avoid param clash)
router.get('/service/:serviceId', getServiceReviews);

// Public — paginated reviews for a provider (?page=1&limit=5)
router.get('/:providerId', getProviderReviews);

// Authenticated — only logged-in customers can submit a review
router.post('/', authenticate, createReview);

export default router;
