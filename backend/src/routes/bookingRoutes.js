import express from 'express';
import { createBooking, listBookings, getBooking, acceptBooking, rejectBooking }
  from '../controllers/bookingController.js';
import { authenticate, requireRole } from '../middleware/authMiddleware.js';
 
const router = express.Router();
 
// All booking routes require authentication
router.use(authenticate);
 
router.get('/',          listBookings);
router.get('/:id',       getBooking);
router.post('/',         requireRole('customer'), createBooking);
router.put('/:id/accept', requireRole('provider'), acceptBooking);
router.put('/:id/reject', requireRole('provider'), rejectBooking);
 
export default router;
