import express from 'express';
import supabase from '../config/supabase.js';
import { checkAndSendReminders } from '../services/reminderService.js';
import { sendBookingReminderEmail } from '../services/emailService.js';

const router = express.Router();

// GET /api/test/ping
router.get('/ping', (req, res) => {
  res.json({
    success: true,
    message: 'Test route alive',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
  });
});

/**
 * POST /api/test/trigger-reminders
 * Manually runs the reminder check against the current 23.5–24.5 hr window.
 * Use this to verify the cron logic without waiting for the scheduler.
 *
 * To create a booking in the right window first:
 *   POST /api/bookings with scheduled_at = NOW + 24h
 */
router.post('/trigger-reminders', async (req, res) => {
  try {
    const result = await checkAndSendReminders();
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('trigger-reminders error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/test/send-reminder/:bookingId
 * Force-sends the reminder email for a specific booking, ignoring the time window.
 * Useful for checking the email template with real DB data.
 *
 * Example:
 *   curl -X POST http://localhost:3000/api/test/send-reminder/<bookingId>
 */
router.post('/send-reminder/:bookingId', async (req, res) => {
  try {
    const { data: booking, error } = await supabase
      .from('bookings')
      .select(`
        id, scheduled_at,
        address_street, address_city, address_state, address_zip,
        customer:users!bookings_customer_id_fkey(email, full_name),
        service:services(name),
        provider:providers(business_name)
      `)
      .eq('id', req.params.bookingId)
      .single();

    if (error || !booking) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    const customerEmail = req.query.to || booking.customer?.email;
    if (!customerEmail) {
      return res.status(400).json({ success: false, error: 'No customer email on this booking' });
    }

    const addressParts = [
      booking.address_street, booking.address_city,
      booking.address_state,  booking.address_zip,
    ].filter(Boolean);

    const result = await sendBookingReminderEmail({
      to:           customerEmail,
      customerName: booking.customer?.full_name        || 'Customer',
      serviceName:  booking.service?.name              || 'Service',
      providerName: booking.provider?.business_name    || 'Provider',
      scheduledAt:  booking.scheduled_at,
      address:      addressParts.join(', '),
    });

    res.json({ success: result.success, emailId: result.id, error: result.error });
  } catch (err) {
    console.error('send-reminder error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
