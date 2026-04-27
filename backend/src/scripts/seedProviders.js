// backend/src/scripts/seedProviders.js
// NEW FILE

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

// Use the service-role key so we can bypass RLS for seeding
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// ─── Provider definitions ─────────────────────────────────────────────────────

const TEST_PROVIDERS = [
  {
    email: 'alice.plumber@servicehub-test.com',
    password: 'TestPass123!',
    fullName: 'Alice Moreno',
    businessName: 'Alice Pro Plumbing',
    description: 'Licensed master plumber with 12 years of experience. Specialising in residential repairs, water heater installs, and drain cleaning.',
    categorySlug: 'plumbing',
    verificationStatus: 'verified',
    services: [
      { name: 'Leak Detection & Repair', customPrice: 110, customDescription: 'I find and fix leaks fast — same day service available.' },
      { name: 'Water Heater Installation', customPrice: 320, customDescription: 'Full install including old unit removal. All brands.' },
    ],
  },
  {
    email: 'bob.sparks@servicehub-test.com',
    password: 'TestPass123!',
    fullName: 'Bob Okafor',
    businessName: 'Sparks Electric Co.',
    description: 'Certified electrician serving the greater metro area. Panel upgrades, EV charger installs, and full rewires.',
    categorySlug: 'electrical',
    verificationStatus: 'verified',
    services: [
      { name: 'Outlet Installation', customPrice: 70, customDescription: 'Any room, code-compliant. Free safety check included.' },
      { name: 'Panel Upgrade', customPrice: 850, customDescription: '200A panel upgrades. Permit pulled and inspected.' },
    ],
  },
  {
    email: 'clara.clean@servicehub-test.com',
    password: 'TestPass123!',
    fullName: 'Clara Nguyen',
    businessName: "Clara's Cleaning Co.",
    description: 'Eco-friendly deep cleaning and regular maintenance for homes and apartments. Flexible scheduling, pet-safe products.',
    categorySlug: 'cleaning',
    verificationStatus: 'pending',
    services: [
      { name: 'Deep Cleaning', customPrice: 140, customDescription: 'Top-to-bottom deep clean. Inside appliances included.' },
      { name: 'Regular Home Cleaning', customPrice: 75, customDescription: 'Weekly or bi-weekly. Same cleaner every visit.' },
    ],
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Generate 4 time slots for a given date string "YYYY-MM-DD" */
function slotsForDate(date, providerId) {
  const times = [
    { start: '09:00', end: '10:00' },
    { start: '11:00', end: '12:00' },
    { start: '14:00', end: '15:00' },
    { start: '16:00', end: '17:00' },
  ];
  return times.map(({ start, end }) => ({
    provider_id: providerId,
    date,
    start_time: start,
    end_time: end,
    is_booked: false,
  }));
}

/** Next N days as "YYYY-MM-DD" strings, starting tomorrow */
function nextNDays(n) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i + 1);
    return d.toISOString().split('T')[0];
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Starting provider seed…\n');

  // 1. Fetch all categories so we can look up by slug
  const { data: categories, error: catError } = await supabase
    .from('categories')
    .select('id, slug');

  if (catError || !categories?.length) {
    console.error('❌ Could not load categories — run seedServices.js first.');
    process.exit(1);
  }

  const catBySlug = Object.fromEntries(categories.map((c) => [c.slug, c.id]));

  // 2. Fetch all platform services so we can link providers to them
  const { data: allServices, error: svcError } = await supabase
    .from('services')
    .select('id, name');

  if (svcError || !allServices?.length) {
    console.error('❌ Could not load services — run seedServices.js first.');
    process.exit(1);
  }

  const svcByName = Object.fromEntries(allServices.map((s) => [s.name, s.id]));

  await Promise.all(
  TEST_PROVIDERS.map(async (def) => {
    console.log(`\n👤 Processing: ${def.fullName} (${def.email})`);

    // ── 3a. Create Supabase Auth user (skip if already exists) ──
    let authUserId;
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existing = existingUsers?.users?.find((u) => u.email === def.email);

    if (existing) {
      authUserId = existing.id;
      console.log(`   Auth user already exists: ${authUserId}`);
    } else {
      const { data: newAuth, error: authError } =
        await supabase.auth.admin.createUser({
          email: def.email,
          password: def.password,
          email_confirm: true,
          user_metadata: { full_name: def.fullName, role: 'provider' },
        });

      if (authError) {
        console.error(`   ❌ Auth create failed: ${authError.message}`);
        return; // was 'continue' — use 'return' inside .map()
      }
      authUserId = newAuth.user.id;
      console.log(`   ✅ Auth user created: ${authUserId}`);
    }

    // ── 3b. Upsert public.users row ──
    const { data: userRow, error: userError } = await supabase
      .from('users')
      .upsert(
        {
          supabase_id: authUserId,
          email: def.email,
          full_name: def.fullName,
          role: 'provider',
        },
        { onConflict: 'supabase_id' },
      )
      .select('id')
      .single();

    if (userError) {
      console.error(`   ❌ users upsert failed: ${userError.message}`);
      return;
    }
    const internalUserId = userRow.id;
    console.log(`   ✅ users row: ${internalUserId}`);

    // ── 3c. Upsert public.providers row ──
    const { data: provRow, error: provError } = await supabase
      .from('providers')
      .upsert(
        {
          user_id: internalUserId,
          business_name: def.businessName,
          description: def.description,
          is_active: true,
          verification_status: def.verificationStatus,
          rating_avg: 0,
          rating_count: 0,
        },
        { onConflict: 'user_id' },
      )
      .select('id')
      .single();

    if (provError) {
      console.error(`   ❌ providers upsert failed: ${provError.message}`);
      return;
    }
    const providerId = provRow.id;
    console.log(`   ✅ providers row: ${providerId}`);

    // ── 3d. Link provider to category ──
    const categoryId = catBySlug[def.categorySlug];
    if (categoryId) {
      await supabase
        .from('provider_categories')
        .upsert(
          { provider_id: providerId, category_id: categoryId },
          { onConflict: 'provider_id,category_id' },
        );
      console.log(`   ✅ provider_categories linked: ${def.categorySlug}`);
    } else {
      console.warn(`   ⚠️  Category slug not found: ${def.categorySlug}`);
    }

    // ── 3e. Link provider to their specific services ──
    // Inner loop also replaced with Promise.all
    await Promise.all(
      def.services.map(async (svcDef) => {
        const serviceId = svcByName[svcDef.name];
        if (!serviceId) {
          console.warn(`   ⚠️  Service not found: "${svcDef.name}"`);
          return;
        }
        const { error: psError } = await supabase
          .from('provider_services')
          .upsert(
            {
              provider_id: providerId,
              service_id: serviceId,
              custom_price: svcDef.customPrice,
              custom_description: svcDef.customDescription,
              is_active: true,
            },
            { onConflict: 'provider_id,service_id' },
          );

        if (psError) {
          console.error(`   ❌ provider_services failed for "${svcDef.name}": ${psError.message}`);
        } else {
          console.log(`   ✅ provider_services: ${svcDef.name} @ $${svcDef.customPrice}`);
        }
      }),
    );

    // ── 3f. Seed availability slots ──
    const dates = nextNDays(7);
    const slots = dates.flatMap((date) => slotsForDate(date, providerId));

    const today = new Date().toISOString().split('T')[0];
    await supabase
      .from('availability_slots')
      .delete()
      .eq('provider_id', providerId)
      .gte('date', today);

    const { error: slotError } = await supabase
      .from('availability_slots')
      .insert(slots);

    if (slotError) {
      console.error(`   ❌ availability_slots failed: ${slotError.message}`);
    } else {
      console.log(`   ✅ availability_slots: ${slots.length} slots for next 7 days`);
    }
  }),
);

  console.log('\n🎉 Provider seed complete.\n');
  console.log('Test credentials:');
  TEST_PROVIDERS.forEach((p) =>
    console.log(`  ${p.email} / TestPass123!  (${p.categorySlug})`),
  );
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});