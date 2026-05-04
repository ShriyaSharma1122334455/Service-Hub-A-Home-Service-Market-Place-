import express from 'express';
import { getMe, getUser, listUsers, updateUserRole, updateUserProfile } from '../controllers/userController.js';
import { authenticate, requireRole } from '../middleware/authMiddleware.js';

const router = express.Router();

// Own profile — any authenticated role
router.get('/me',      authenticate, getMe);
router.put('/me',      authenticate, updateUserProfile);
router.put('/me/role', authenticate, updateUserRole);

// Admin-only routes
router.get('/:id', authenticate, requireRole('admin'), getUser);
router.get('/',    authenticate, requireRole('admin'), listUsers);

export default router;