/**
 * seedReviews.js
 *
 * Seeds 15 reviews for Deep Clean Pro so pagination (SER-83) can be tested.
 * Creates completed bookings first (bypasses the API), then inserts reviews.
 *
 * Run: node src/scripts/seedReviews.js
 *
 * Safe to re-run — uses upsert on bookings and skips existing reviews.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const REVIEW_FIXTURES = [
  { rating: 5, comment: 'Absolutely amazing service! The team was punctual, thorough, and left everything spotless.' },
  { rating: 5, comment: 'Best cleaning service I have ever used. Highly recommend to anyone in the area.' },
  { rating: 4, comment: 'Great job overall. A few spots were missed but they came back and fixed it right away.' },
  { rating: 5, comment: 'Professional, friendly, and very detailed. Will definitely book again.' },
  { rating: 3, comment: 'Decent job. Could be a bit more careful with fragile items but nothing was broken.' },
  { rating: 5, comment: 'Showed up on time and did an outstanding job. My apartment has never been this clean!' },
  { rating: 4, comment: 'Very satisfied. The price was fair and the quality was excellent.' },
  { rating: 2, comment: 'Service was okay but not worth the price. Expected more attention to detail.' },
  { rating: 5, comment: 'I am so impressed. Every corner was cleaned and they even organized my shelves.' },
  { rating: 4, comment: 'Good experience. The cleaner was polite and efficient. Minor issues with the bathroom.' },
  { rating: 5, comment: 'Five stars! Fast, professional, and thorough. Booked them again for next month.' },
  { rating: 3, comment: 'Average cleaning. Got the job done but nothing special.' },
  { rating: 5, comment: 'Incredible attention to detail. They cleaned places I had forgotten about entirely.' },
  { rating: 4, comment: 'Very reliable. Third time using them and always consistent quality.' },
  { rating: 5, comment: 'Worth every penny. My house smells fresh and every surface is spotless.' },
];

async function main() {
  console.log('🌱 Seeding reviews for SER-83 pagination testing...\n');

  // 1. Resolve Deep Clean Pro provider
  const { data: providers, error: pErr } = await supabase
    .from('providers')
    .select('id, business_name')
    .ilike('business_name', '%Deep Clean%')
    .limit(1);

  if (pErr || !providers?.length) {
    console.error('❌ Could not find "Deep Clean Pro" provider. Run seedDeepTestData.js first.');
    process.exit(1);
  }
  const provider = providers[0];
  console.log(`✅ Provider: ${provider.business_name} (${provider.id})`);

  // 2. Resolve customer user IDs
  const { data: users, error: uErr } = await supabase
    .from('users')
    .select('id, email')
    .in('email', ['deep_user1@yopmail.com', 'deep_user2@yopmail.com']);

  if (uErr || !users?.length) {
    console.error('❌ Test users not found. Register deep_user1@yopmail.com and deep_user2@yopmail.com first.');
    process.exit(1);
  }

  const userMap = {};
  for (const u of users) userMap[u.email] = u.id;
  console.log(`✅ Customers: ${Object.keys(userMap).join(', ')}\n`);

  // 3. Resolve a cleaning service
  const { data: services, error: sErr } = await supabase
    .from('services')
    .select('id, name')
    .ilike('name', '%clean%')
    .limit(1);

  if (sErr || !services?.length) {
    console.error('❌ No cleaning service found in DB.');
    process.exit(1);
  }
  const service = services[0];
  console.log(`✅ Service: ${service.name} (${service.id})\n`);

  // 4. Create 15 completed bookings at different past dates
  console.log('📅 Inserting completed bookings...');
  const now = Date.now();
  const customerIds = [
    userMap['deep_user1@yopmail.com'],
    userMap['deep_user2@yopmail.com'],
  ].filter(Boolean);

  const bookings = REVIEW_FIXTURES.map((_, i) => ({
    customer_id:    customerIds[i % customerIds.length],
    provider_id:    provider.id,
    service_id:     service.id,
    status:         'completed',
    scheduled_at:   new Date(now - (i + 1) * 3 * 86_400_000).toISOString(), // 3-day intervals back
    completed_at:   new Date(now - (i + 1) * 3 * 86_400_000 + 3600_000).toISOString(),
    total_price:    89,
    payment_status: 'paid',
    notes:          `Seed booking #${i + 1} for review pagination testing`,
    address_street: '100 Broad St',
    address_city:   'Newark',
    address_state:  'NJ',
    address_zip:    '07102',
  }));

  const { data: insertedBookings, error: bErr } = await supabase
    .from('bookings')
    .insert(bookings)
    .select('id, customer_id');

  if (bErr) {
    console.error('❌ Failed to insert bookings:', bErr.message);
    process.exit(1);
  }
  console.log(`  ✅ Inserted ${insertedBookings.length} completed bookings\n`);

  // 5. Insert reviews linked to those bookings
  console.log('⭐ Inserting reviews...');
  let created = 0;
  let skipped = 0;

  for (let i = 0; i < insertedBookings.length; i++) {
    const booking  = insertedBookings[i];
    const fixture  = REVIEW_FIXTURES[i];

    // Keep inserts sequential so progress logs are ordered and easy to read.
    // eslint-disable-next-line no-await-in-loop
    const { error: rErr } = await supabase
      .from('reviews')
      .insert({
        booking_id:   booking.id,
        reviewer_id:  booking.customer_id,
        provider_id:  provider.id,
        rating:       fixture.rating,
        comment:      fixture.comment,
      });

    if (rErr) {
      if (rErr.code === '23505') {
        skipped++;
      } else {
        console.error(`  ❌ Review ${i + 1} failed: ${rErr.message}`);
      }
    } else {
      created++;
      console.log(`  ✅ Review ${i + 1}: ${fixture.rating}★ — "${fixture.comment.slice(0, 50)}…"`);
    }
  }

  // 6. Refresh provider avg rating
  const { data: allReviews } = await supabase
    .from('reviews')
    .select('rating')
    .eq('provider_id', provider.id);

  if (allReviews?.length) {
    const avg = allReviews.reduce((s, r) => s + r.rating, 0) / allReviews.length;
    await supabase
      .from('providers')
      .update({ rating_avg: Math.round(avg * 100) / 100, rating_count: allReviews.length })
      .eq('id', provider.id);
    console.log(`\n  ✅ Provider avg updated → ${(Math.round(avg * 100) / 100).toFixed(2)}★ (${allReviews.length} reviews)`);
  }

  console.log(`\n🎉 Done! Created: ${created}, Skipped (duplicate): ${skipped}`);
  console.log(`   Test pagination at: GET /api/reviews/${provider.id}?page=1&limit=5\n`);
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
