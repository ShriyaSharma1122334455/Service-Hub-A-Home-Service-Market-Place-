/**
 * seedDeepTestData.js
 *
 * Seeds Supabase with provider profiles and sample bookings for the
 * yopmail test accounts used to verify PR #26 (service catalog) and
 * PR #28 (chatbot / booking flow).
 *
 * Run: node src/scripts/seedDeepTestData.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ─── Known IDs (from live DB) ─────────────────────────────────────────────────

const CATEGORY = {
  cleaning:    'a2466b0f-366c-415e-9c16-d4f2815e3dbe',
  electrical:  '5ef50120-2f25-4c8a-84cb-b1f48bade443',
  pest:        '53af8970-d5e9-475c-8cca-aa85087d93e7',
  plumbing:    '7bb1c72d-481f-4ed1-8400-ba811c8c9286',
};

// public.users IDs for the yopmail accounts
const USER = {
  deep_user1:      'f6adda34-62a5-4824-a736-eabba5eea460',
  deep_user2:      '8661cae4-a416-4979-8163-6fff5b983867',
  deep_plumber:    '03a1ac86-d8c0-4f75-ad0d-2df38e8a5254',
  deep_cleaner:    'edc45e78-0cc2-4578-8019-77cf8f10831d',
  deep_electrical: '1a55a6db-ebad-4af6-855f-7b1bd2f62521',
  deep_pest:       '2d11a8e6-d9f4-4877-b0e6-feb31b639bf0',
};

// ─── Step 1: Insert provider profiles ─────────────────────────────────────────

async function seedProviders() {
  console.log('\n📋 Step 1 — Seeding provider profiles...');

  const providers = [
    {
      user_id:          USER.deep_plumber,
      business_name:    'Deep Plumber Services',
      description:      'Certified plumber with 8+ years experience. Specialises in leak detection, drain cleaning, and full pipe installations.',
      rating_avg:       0,
      rating_count:     0,
      is_active:        true,
      id_verified:      false,
      face_matched:     false,
      nsopw_checked:    false,
      self_declared:    false,
    },
    {
      user_id:          USER.deep_cleaner,
      business_name:    'Deep Clean Pro',
      description:      'Professional home cleaning service. Regular, deep-clean, and move-in/out packages available. Fully insured.',
      rating_avg:       0,
      rating_count:     0,
      is_active:        true,
      id_verified:      false,
      face_matched:     false,
      nsopw_checked:    false,
      self_declared:    false,
    },
    {
      user_id:          USER.deep_electrical,
      business_name:    'Deep Electrical Solutions',
      description:      'Licensed electrician for residential and light commercial work. Outlets, panels, fans, and wiring repairs.',
      rating_avg:       0,
      rating_count:     0,
      is_active:        true,
      id_verified:      false,
      face_matched:     false,
      nsopw_checked:    false,
      self_declared:    false,
    },
    {
      user_id:          USER.deep_pest,
      business_name:    'Deep Pest Control',
      description:      'Safe and effective pest control for insects, rodents, and prevention. Eco-friendly treatments available.',
      rating_avg:       0,
      rating_count:     0,
      is_active:        true,
      id_verified:      false,
      face_matched:     false,
      nsopw_checked:    false,
      self_declared:    false,
    },
  ];

  const { data, error } = await supabase
    .from('providers')
    .upsert(providers, { onConflict: 'user_id', ignoreDuplicates: false })
    .select('id, user_id, business_name');

  if (error) {
    console.error('❌ Failed to insert providers:', error.message);
    return null;
  }

  data.forEach(p => console.log(`  ✅ ${p.business_name} → provider.id: ${p.id}`));
  return data; // [ { id, user_id, business_name } ]
}

// ─── Step 2: Link providers to their categories ───────────────────────────────

async function seedProviderCategories(providerRows) {
  console.log('\n🔗 Step 2 — Linking providers to categories...');

  // Map business_name → category_id
  const categoryMap = {
    'Deep Plumber Services':       CATEGORY.plumbing,
    'Deep Clean Pro':              CATEGORY.cleaning,
    'Deep Electrical Solutions':   CATEGORY.electrical,
    'Deep Pest Control':           CATEGORY.pest,
  };

  const rows = providerRows.map(p => ({
    provider_id: p.id,
    category_id: categoryMap[p.business_name],
  }));

  const { error } = await supabase
    .from('provider_categories')
    .upsert(rows, { onConflict: 'provider_id,category_id', ignoreDuplicates: true });

  if (error) {
    console.error('❌ Failed to link provider categories:', error.message);
    return;
  }

  rows.forEach(r => console.log(`  ✅ provider ${r.provider_id.slice(0,8)} → category ${r.category_id.slice(0,8)}`));
}

// ─── Step 3: Fetch service IDs per category ───────────────────────────────────

async function getServiceIds() {
  const { data, error } = await supabase
    .from('services')
    .select('id, name, category_id');

  if (error) { console.error('❌ Cannot fetch services:', error.message); return {}; }

  const map = {};
  data.forEach(s => {
    if (!map[s.category_id]) map[s.category_id] = [];
    map[s.category_id].push(s);
  });
  return map;
}

// ─── Step 4: Seed sample bookings ────────────────────────────────────────────

async function seedBookings(providerRows, serviceMap) {
  console.log('\n📅 Step 4 — Seeding sample bookings...');

  const plumber  = providerRows.find(p => p.business_name === 'Deep Plumber Services');
  const cleaner  = providerRows.find(p => p.business_name === 'Deep Clean Pro');
  const electric = providerRows.find(p => p.business_name === 'Deep Electrical Solutions');
  const pest     = providerRows.find(p => p.business_name === 'Deep Pest Control');

  const plumbingService  = serviceMap[CATEGORY.plumbing]?.[0];
  const cleaningService  = serviceMap[CATEGORY.cleaning]?.[0];
  const electricalService = serviceMap[CATEGORY.electrical]?.[0];
  const pestService      = serviceMap[CATEGORY.pest]?.[0];

  const now = new Date();
  const daysAgo  = d => new Date(now - d * 86400000).toISOString();
  const daysAhead = d => new Date(now.getTime() + d * 86400000).toISOString();

  const bookings = [
    // ── deep_user1 bookings ──
    {
      customer_id:    USER.deep_user1,
      provider_id:    plumber.id,
      service_id:     plumbingService.id,
      status:         'completed',
      scheduled_at:   daysAgo(10),
      completed_at:   daysAgo(10),
      total_price:    plumbingService ? 79 : 79,
      payment_status: 'paid',
      notes:          'Kitchen sink leaking under the cabinet',
      address_street: '100 Broad St',
      address_city:   'Newark',
      address_state:  'NJ',
      address_zip:    '07102',
    },
    {
      customer_id:    USER.deep_user1,
      provider_id:    cleaner.id,
      service_id:     cleaningService.id,
      status:         'confirmed',
      scheduled_at:   daysAhead(3),
      completed_at:   null,
      total_price:    89,
      payment_status: 'pending',
      notes:          'Full apartment regular clean before guests arrive',
      address_street: '100 Broad St',
      address_city:   'Newark',
      address_state:  'NJ',
      address_zip:    '07102',
    },
    {
      customer_id:    USER.deep_user1,
      provider_id:    pest.id,
      service_id:     pestService.id,
      status:         'pending',
      scheduled_at:   daysAhead(7),
      completed_at:   null,
      total_price:    99,
      payment_status: 'pending',
      notes:          'Saw cockroaches in the kitchen area',
      address_street: '100 Broad St',
      address_city:   'Newark',
      address_state:  'NJ',
      address_zip:    '07102',
    },
    // ── deep_user2 bookings ──
    {
      customer_id:    USER.deep_user2,
      provider_id:    electric.id,
      service_id:     electricalService.id,
      status:         'completed',
      scheduled_at:   daysAgo(5),
      completed_at:   daysAgo(5),
      total_price:    89,
      payment_status: 'paid',
      notes:          'Install 2 new outlets in home office',
      address_street: '250 Park Ave',
      address_city:   'Newark',
      address_state:  'NJ',
      address_zip:    '07104',
    },
    {
      customer_id:    USER.deep_user2,
      provider_id:    plumber.id,
      service_id:     plumbingService.id,
      status:         'pending',
      scheduled_at:   daysAhead(2),
      completed_at:   null,
      total_price:    59,
      payment_status: 'pending',
      notes:          'Slow drain in bathroom shower',
      address_street: '250 Park Ave',
      address_city:   'Newark',
      address_state:  'NJ',
      address_zip:    '07104',
    },
  ];

  const { data, error } = await supabase
    .from('bookings')
    .insert(bookings)
    .select('id, customer_id, provider_id, status, total_price');

  if (error) {
    console.error('❌ Failed to insert bookings:', error.message);
    return;
  }

  data.forEach(b => {
    const who = b.customer_id === USER.deep_user1 ? 'deep_user1' : 'deep_user2';
    console.log(`  ✅ [${who}] booking ${b.id.slice(0,8)} — ${b.status} $${b.total_price}`);
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Starting Deep test data seed...');
  console.log(`   Supabase: ${process.env.SUPABASE_URL}`);

  // 1. Providers
  const providerRows = await seedProviders();
  if (!providerRows) { console.error('Aborting — provider insert failed'); process.exit(1); }

  // 2. Provider → Category links
  await seedProviderCategories(providerRows);

  // 3. Fetch service IDs
  console.log('\n🔍 Step 3 — Fetching service IDs...');
  const serviceMap = await getServiceIds();
  const total = Object.values(serviceMap).flat().length;
  console.log(`  ✅ Found ${total} services across ${Object.keys(serviceMap).length} categories`);

  // 4. Bookings
  await seedBookings(providerRows, serviceMap);

  console.log('\n🎉 Seed complete!\n');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
