import cron from 'node-cron';
import supabase from '../config/supabase.js';
import { sendBookingReminderEmail } from './emailService.js';

// In-memory dedup: prevents re-sending within the same server session
const sentReminders = new Set();

/**
 * Query confirmed bookings in the 23.5–24.5 hour window and send reminder emails.
 * Safe to call multiple times — sentReminders guards against duplicates.
 */
export async function checkAndSendReminders() {
  const now = Date.now();
  const windowStart = new Date(now + 23.5 * 3600_000).toISOString();
  const windowEnd   = new Date(now + 24.5 * 3600_000).toISOString();

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select(`
      id, scheduled_at,
      address_street, address_city, address_state, address_zip,
      customer:users!bookings_customer_id_fkey(email, full_name),
      service:services(name),
      provider:providers(business_name)
    `)
    .eq('status', 'confirmed')
    .gte('scheduled_at', windowStart)
    .lte('scheduled_at', windowEnd);

  if (error) {
    console.error('❌ Reminder query error:', error.message);
    return { sent: 0, errors: 1 };
  }

  // Build send tasks — skip already-sent and bookings without a customer email
  const tasks = (bookings ?? [])
    .filter(b => !sentReminders.has(b.id) && b.customer?.email)
    .map(booking => {
      const addressParts = [
        booking.address_street,
        booking.address_city,
        booking.address_state,
        booking.address_zip,
      ].filter(Boolean);

      return sendBookingReminderEmail({
        to:           booking.customer.email,
        customerName: booking.customer.full_name      || 'Customer',
        serviceName:  booking.service?.name           || 'Service',
        providerName: booking.provider?.business_name || 'Provider',
        scheduledAt:  booking.scheduled_at,
        address:      addressParts.join(', '),
      }).then(result => ({ booking, result }));
    });

  const outcomes = await Promise.allSettled(tasks);
  let sent = 0;
  let errors = 0;

  for (const outcome of outcomes) {
    if (outcome.status === 'rejected') { errors++; continue; }
    const { booking, result } = outcome.value;
    if (result.success) {
      sentReminders.add(booking.id);
      sent++;
      console.log(`  ✅ Reminder sent → booking ${booking.id.slice(0, 8)} (${booking.customer.email})`);
    } else {
      errors++;
      console.error(`  ❌ Reminder failed → booking ${booking.id.slice(0, 8)}: ${result.error}`);
    }
  }

  console.log(`🔔 Reminder run complete — sent: ${sent}, errors: ${errors}, window: ${windowStart} → ${windowEnd}`);
  return { sent, errors };
}

/**
 * Starts the cron job. Call once on server startup (skipped in test env).
 * Schedule: every 15 minutes.
 */
export function startReminderCron() {
  cron.schedule('*/15 * * * *', () => {
    checkAndSendReminders().catch(err =>
      console.error('❌ Reminder cron unhandled error:', err)
    );
  });
  console.log('🔔 Booking reminder cron started (runs every 15 min)');
}
