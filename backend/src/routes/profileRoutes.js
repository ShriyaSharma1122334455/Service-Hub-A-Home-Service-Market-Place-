import express from 'express';
import { getMe, getUser, listUsers } from '../controllers/userController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/me', authenticate, getMe);
router.get('/:id', authenticate, getUser);
router.get('/', authenticate, listUsers);

export default router;