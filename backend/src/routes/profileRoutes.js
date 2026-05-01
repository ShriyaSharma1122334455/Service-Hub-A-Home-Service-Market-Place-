import express from 'express';
import { getMe, getUser, listUsers, updateUserRole, updateUserProfile } from '../controllers/userController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/me', authenticate, getMe);
router.put('/me', authenticate, updateUserProfile);
router.put('/me/role', authenticate, updateUserRole);
router.get('/:id', authenticate, getUser);
router.get('/', authenticate, listUsers);

export default router;