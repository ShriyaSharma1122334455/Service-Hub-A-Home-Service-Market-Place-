import express from 'express';
import { createComplaint, listComplaints, getComplaint } from '../controllers/complaintController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = express.Router();

// POST /api/complaints — submit a complaint (any logged in user)
router.post('/', authenticate, createComplaint);

// GET /api/complaints — get own complaints
router.get('/', authenticate, listComplaints);

// GET /api/complaints/:id — get single complaint
router.get('/:id', authenticate, getComplaint);

export default router;