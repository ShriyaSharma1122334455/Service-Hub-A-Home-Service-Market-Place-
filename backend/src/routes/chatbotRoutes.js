import express from 'express';
import { getChatbotContext } from '../controllers/chatbotController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = express.Router();

// GET /api/chatbot/context — role-aware booking data for the chatbot
router.get('/context', authenticate, getChatbotContext);

export default router;
