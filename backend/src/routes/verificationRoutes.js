import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { uploadSingle } from '../middleware/uploadMiddleware.js';
import {
  getPrefill,
  uploadId,
  uploadSelfie,
  submitVerification,
  getStatus,
} from '../controllers/verificationController.js';

const router = express.Router();

router.use(authenticate);

// POST because instructions specify `POST /api/verification/prefill/:userId`
router.post('/prefill/:userId', getPrefill);

router.post('/upload-id', uploadSingle('document'), uploadId);
router.post('/upload-selfie', uploadSingle('selfie'), uploadSelfie);
router.post('/submit', submitVerification);
router.get('/status/:userId', getStatus);

export default router;
