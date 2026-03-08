/**
 * @fileoverview Booking controller.
 * @module controllers/bookingController
 */
import Booking from '../models/Booking.js';
 
export const createBooking = async (req, res) => {
  try {
    const booking = await Booking.create({ ...req.body, customerId: req.user.id });
    res.status(201).json({ success: true, data: booking });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};
 
export const listBookings = async (req, res) => {
  try {
    const filter = req.user.role === 'provider'
      ? { providerId: req.user.id }
      : { customerId: req.user.id };
    const bookings = await Booking.find(filter)
      .populate('serviceId', 'name price')
      .populate('providerId', 'businessName')
      .sort({ createdAt: -1 }).lean();
    res.json({ success: true, count: bookings.length, data: bookings });
  } catch (_err) {
    res.status(500).json({ success: false, error: 'Failed to list bookings' });
  }
};
 
export const getBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('serviceId').populate('providerId').lean();
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' });
    res.json({ success: true, data: booking });
  } catch (_err) {
    res.status(500).json({ success: false, error: 'Failed to fetch booking' });
  }
};
 
export const acceptBooking = async (req, res) => {
  try {
    const booking = await Booking.findByIdAndUpdate(
      req.params.id, { status: 'confirmed' }, { new: true }
    );
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' });
    res.json({ success: true, data: booking });
  } catch (_err) {
    res.status(500).json({ success: false, error: 'Failed to accept booking' });
  }
};
 
export const rejectBooking = async (req, res) => {
  try {
    const booking = await Booking.findByIdAndUpdate(
      req.params.id,
      { status: 'cancelled', cancellationReason: req.body.reason || 'Rejected by provider' },
      { new: true }
    );
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' });
    res.json({ success: true, data: booking });
  } catch (_err) {
    res.status(500).json({ success: false, error: 'Failed to reject booking' });
  }
};
