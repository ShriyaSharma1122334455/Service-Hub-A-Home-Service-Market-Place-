/**
 * seedDeepTestData.js
 *
 * Seeds Supabase with provider profiles and sample bookings for the
 * yopmail test accounts used to verify PR #26 (service catalog) and
 * PR #28 (chatbot / booking flow).
 *
 * All IDs are resolved dynamically from the live DB — no hardcoded UUIDs.
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

// ─── Test account emails ───────────────────────────────────────────────────────
// These yopmail accounts must already exist in Supabase Auth before running.

const TEST_EMAILS = {
  deep_user1:      'deep_user1@yopmail.com',
  deep_user2:      'deep_user2@yopmail.com',
  deep_plumber:    'deep_plumber@yopmail.com',
  deep_cleaner:    'deep_cleaner@yopmail.com',
  deep_electrical: 'deep_electrical@yopmail.com',
  deep_pest:       'deep_pest@yopmail.com',
};

// ─── Step 0: Resolve IDs from the live DB ─────────────────────────────────────

async function resolveIds() {
  console.log('\n🔍 Step 0 — Resolving IDs from DB...');

  // Resolve user IDs by email
  const emailList = Object.values(TEST_EMAILS);
  const { data: users, error: usersErr } = await supabase
    .from('users')
    .select('id, email')
    .in('email', emailList);

  if (usersErr || !users?.length) {
    console.error('❌ Failed to fetch users:', usersErr?.message);
    console.error('   Ensure the yopmail test accounts are registered before running this script.');
    process.exit(1);
  }

  const USER = {};
  for (const [key, email] of Object.entries(TEST_EMAILS)) {
    const found = users.find(u => u.email === email);
    if (!found) {
      console.error(`❌ User not found for email: ${email}. Register this account first.`);
      process.exit(1);
    }
    USER[key] = found.id;
    console.log(`  ✅ ${key} → ${found.id}`);
  }

  // Resolve category IDs by slug
  const { data: categories, error: catErr } = await supabase
    .from('categories')
    .select('id, slug');

  if (catErr || !categories?.length) {
    console.error('❌ Failed to fetch categories:', catErr?.message);
    process.exit(1);
  }

  const CATEGORY = {};
  for (const cat of categories) {
    CATEGORY[cat.slug] = cat.id;
    console.log(`  ✅ category "${cat.slug}" → ${cat.id}`);
  }

  return { USER, CATEGORY };
}

// ─── Step 1: Insert provider profiles ─────────────────────────────────────────

async function seedProviders(USER) {
  console.log('\n📋 Step 1 — Seeding provider profiles...');

  const providers = [
    {
      user_id:       USER.deep_plumber,
      business_name: 'Deep Plumber Services',
      description:   'Certified plumber with 8+ years experience. Specialises in leak detection, drain cleaning, and full pipe installations.',
      rating_avg:    0,
      rating_count:  0,
      is_active:     true,
      id_verified:   false,
      face_matched:  false,
      nsopw_checked: false,
      self_declared: false,
    },
    {
      user_id:       USER.deep_cleaner,
      business_name: 'Deep Clean Pro',
      description:   'Professional home cleaning service. Regular, deep-clean, and move-in/out packages available. Fully insured.',
      rating_avg:    0,
      rating_count:  0,
      is_active:     true,
      id_verified:   false,
      face_matched:  false,
      nsopw_checked: false,
      self_declared: false,
    },
    {
      user_id:       USER.deep_electrical,
      business_name: 'Deep Electrical Solutions',
      description:   'Licensed electrician for residential and light commercial work. Outlets, panels, fans, and wiring repairs.',
      rating_avg:    0,
      rating_count:  0,
      is_active:     true,
      id_verified:   false,
      face_matched:  false,
      nsopw_checked: false,
      self_declared: false,
    },
    {
      user_id:       USER.deep_pest,
      business_name: 'Deep Pest Control',
      description:   'Safe and effective pest control for insects, rodents, and prevention. Eco-friendly treatments available.',
      rating_avg:    0,
      rating_count:  0,
      is_active:     true,
      id_verified:   false,
      face_matched:  false,
      nsopw_checked: false,
      self_declared: false,
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
  return data;
}

// ─── Step 2: Link providers to their categories ───────────────────────────────

async function seedProviderCategories(providerRows, CATEGORY) {
  console.log('\n🔗 Step 2 — Linking providers to categories...');

  const pestCatId = CATEGORY['pest-control'] ?? CATEGORY.pest;
  const categoryByName = {
    'Deep Plumber Services':     CATEGORY.plumbing,
    'Deep Clean Pro':            CATEGORY.cleaning,
    'Deep Electrical Solutions': CATEGORY.electrical,
    'Deep Pest Control':         pestCatId,
  };

  const rows = providerRows
    .map(p => ({ provider_id: p.id, category_id: categoryByName[p.business_name] }))
    .filter(r => r.category_id);

  const { error } = await supabase
    .from('provider_categories')
    .upsert(rows, { onConflict: 'provider_id,category_id', ignoreDuplicates: true });

  if (error) {
    console.error('❌ Failed to link provider categories:', error.message);
    return;
  }

  rows.forEach(r => console.log(`  ✅ provider ${r.provider_id.slice(0, 8)} → category ${r.category_id.slice(0, 8)}`));
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

// ─── Step 4: Seed sample bookings ─────────────────────────────────────────────

async function seedBookings(providerRows, serviceMap, USER, CATEGORY) {
  console.log('\n📅 Step 4 — Seeding sample bookings...');

  const plumber  = providerRows.find(p => p.business_name === 'Deep Plumber Services');
  const cleaner  = providerRows.find(p => p.business_name === 'Deep Clean Pro');
  const electric = providerRows.find(p => p.business_name === 'Deep Electrical Solutions');
  const pest     = providerRows.find(p => p.business_name === 'Deep Pest Control');

  const pestCatId = CATEGORY['pest-control'] ?? CATEGORY.pest;

  const plumbingService   = serviceMap[CATEGORY.plumbing]?.[0];
  const cleaningService   = serviceMap[CATEGORY.cleaning]?.[0];
  const electricalService = serviceMap[CATEGORY.electrical]?.[0];
  const pestService       = serviceMap[pestCatId]?.[0];

  if (!plumbingService || !cleaningService || !electricalService || !pestService) {
    console.warn('⚠️  One or more services not found in DB — skipping bookings that depend on them.');
  }

  const now = new Date();
  const daysAgo   = d => new Date(now - d * 86400000).toISOString();
  const daysAhead = d => new Date(now.getTime() + d * 86400000).toISOString();

  const bookings = [
    // ── deep_user1 bookings ──
    plumbingService && {
      customer_id:    USER.deep_user1,
      provider_id:    plumber.id,
      service_id:     plumbingService.id,
      status:         'completed',
      scheduled_at:   daysAgo(10),
      completed_at:   daysAgo(10),
      total_price:    79,
      payment_status: 'paid',
      notes:          'Kitchen sink leaking under the cabinet',
      address_street: '100 Broad St',
      address_city:   'Newark',
      address_state:  'NJ',
      address_zip:    '07102',
    },
    cleaningService && {
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
    pestService && {
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
    electricalService && {
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
    plumbingService && {
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
  ].filter(Boolean);

  if (!bookings.length) {
    console.warn('  ⚠️  No bookings to insert.');
    return;
  }

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
    console.log(`  ✅ [${who}] booking ${b.id.slice(0, 8)} — ${b.status} $${b.total_price}`);
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Starting Deep test data seed...');
  console.log(`   Supabase: ${process.env.SUPABASE_URL}`);

  // 0. Resolve all IDs from DB (no hardcoded UUIDs)
  const { USER, CATEGORY } = await resolveIds();

  // 1. Provider profiles
  const providerRows = await seedProviders(USER);
  if (!providerRows) { console.error('Aborting — provider insert failed'); process.exit(1); }

  // 2. Provider → Category links
  await seedProviderCategories(providerRows, CATEGORY);

  // 3. Fetch service IDs from backend
  console.log('\n🔍 Step 3 — Fetching service IDs...');
  const serviceMap = await getServiceIds();
  const total = Object.values(serviceMap).flat().length;
  console.log(`  ✅ Found ${total} services across ${Object.keys(serviceMap).length} categories`);

  // 4. Sample bookings
  await seedBookings(providerRows, serviceMap, USER, CATEGORY);

  console.log('\n🎉 Seed complete!\n');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
