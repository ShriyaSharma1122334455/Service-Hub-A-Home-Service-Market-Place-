import express from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { assessVisualDamage } from '../controllers/assessmentController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const assessLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { success: false, error: 'Too many assessment requests. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/** Visual damage assessment is for signed-in customers only (not providers). */
function requireCustomer(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Sign in as a customer to use visual assessment.',
    });
  }
  const role = String(req.user.role ?? '').toLowerCase();
  if (role !== 'customer') {
    return res.status(403).json({
      success: false,
      error: 'Visual assessment is available to customers only.',
    });
  }
  return next();
}

router.post(
  '/visual',
  assessLimiter,
  authenticate,
  requireCustomer,
  upload.single('image'),
  assessVisualDamage,
);

export default router;
