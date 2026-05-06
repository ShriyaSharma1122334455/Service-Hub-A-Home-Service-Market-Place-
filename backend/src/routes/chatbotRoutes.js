import express from 'express';
import { getChatbotContext, postChatbotMessage } from '../controllers/chatbotController.js';
import { authenticate, optionalAuthenticate } from '../middleware/authMiddleware.js';

const router = express.Router();

// GET /api/chatbot/context — role-aware booking data for the chatbot
router.get('/context', authenticate, getChatbotContext);

// POST /api/chatbot/message — LLM-powered chatbot reply (guests allowed)
router.post('/message', optionalAuthenticate, postChatbotMessage);

export default router;
