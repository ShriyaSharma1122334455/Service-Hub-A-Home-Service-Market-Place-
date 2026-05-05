import express from 'express';
import { createReview, getProviderReviews } from '../controllers/reviewController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public — anyone can read reviews for a provider
router.get('/:providerId', getProviderReviews);

// Authenticated — only logged-in customers can submit a review
router.post('/', authenticate, createReview);

export default router;
