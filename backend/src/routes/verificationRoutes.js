/**
 * @fileoverview Verification routes for the identity verification pipeline.
 *
 * All routes require authentication via the `authenticate` middleware.
 * File uploads use multer with memory storage.
 *
 * @module routes/verificationRoutes
 */

import express from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/authMiddleware.js';
import {
  getPrefill,
  uploadId,
  uploadSelfie,
  submitVerification,
  getStatus,
} from '../controllers/verificationController.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// All verification routes require authentication
router.use(authenticate);

// Pre-populate form with user data
router.get('/prefill/:userId', getPrefill);

// Upload ID document → triggers OCR
router.post('/upload-id', upload.single('document'), uploadId);

// Upload selfie → triggers face matching
router.post('/upload-selfie', upload.single('selfie'), uploadSelfie);

// Final submission → triggers NSOPW check
router.post('/submit', submitVerification);

// Get verification status for a user
router.get('/status/:userId', getStatus);

export default router;
