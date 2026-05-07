import cron from 'node-cron';
import supabase from '../config/supabase.js';

/**
 * Marks confirmed bookings whose scheduled_at is in the past as completed.
 *
 * Workaround for the missing customer-side / automated complete flow: until a
 * proper completion handshake exists, any confirmed booking past its
 * scheduled_at is treated as fulfilled. Pending and cancelled bookings are
 * left alone.
 *
 * Idempotent — the .eq('status', 'confirmed') guard means re-runs are no-ops
 * once a row has been flipped, and races with provider-side completeBooking
 * resolve safely (whichever lands second updates zero rows).
 */
export async function autoCompletePastBookings() {
  const nowIso = new Date().toISOString();

  const { data: updated, error } = await supabase
    .from('bookings')
    .update({ status: 'completed', completed_at: nowIso })
    .eq('status', 'confirmed')
    .lt('scheduled_at', nowIso)
    .select('id');

  if (error) {
    console.error('❌ Auto-complete query error:', error.message);
    return { completed: 0, errors: 1 };
  }

  const count = updated?.length ?? 0;
  if (count > 0) {
    console.log(`✅ Auto-completed ${count} past booking(s) at ${nowIso}`);
  }
  return { completed: count, errors: 0 };
}

/**
 * Starts the auto-complete cron. Call once on server startup (skipped in tests).
 * Same 15-minute cadence as the reminder cron so the load profile stays similar.
 */
export function startAutoCompleteCron() {
  cron.schedule('*/15 * * * *', () => {
    autoCompletePastBookings().catch((err) =>
      console.error('❌ Auto-complete cron unhandled error:', err),
    );
  });
  console.log('🕒 Booking auto-complete cron started (runs every 15 min)');
}
