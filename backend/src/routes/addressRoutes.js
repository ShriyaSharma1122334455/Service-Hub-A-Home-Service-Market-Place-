import express from 'express';
import { createAddress } from '../controllers/addressController.js';
import { authenticate  } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/', authenticate , createAddress);

export default router;