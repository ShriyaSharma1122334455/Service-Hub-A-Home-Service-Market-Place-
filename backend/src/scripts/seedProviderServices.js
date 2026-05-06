/**
 * Seed provider_services — links test providers to their relevant services.
 * Run once: node src/scripts/seedProviderServices.js
 */
import supabase from '../config/supabase.js';

const ENTRIES = [
  // Deep Clean Pro
  { provider_id: '58239207-aec2-4d80-955a-bc450d78a903', service_id: '2be5a06d-4818-4fe5-9bfc-c664e5540456' }, // Deep Clean
  { provider_id: '58239207-aec2-4d80-955a-bc450d78a903', service_id: 'f9161b39-4d46-49f3-ba42-8f2794e36b60' }, // Move In/Out Clean
  { provider_id: '58239207-aec2-4d80-955a-bc450d78a903', service_id: '09a97349-6bd2-4d70-ad7d-af359179488b' }, // Regular Maintenance

  // Deep Plumber Services
  { provider_id: 'e70895b3-c86f-4f43-b63a-7229126a109d', service_id: 'c7c72cd1-b811-423c-a555-27a91cf2ec07' }, // Drain Cleaning
  { provider_id: 'e70895b3-c86f-4f43-b63a-7229126a109d', service_id: '234f26b8-b8ac-4333-b40b-aaa8250f8fa8' }, // Leak Repair
  { provider_id: 'e70895b3-c86f-4f43-b63a-7229126a109d', service_id: '11a78f08-e088-4e96-a761-d01ccd3aaa1e' }, // Pipe Installation
  { provider_id: 'e70895b3-c86f-4f43-b63a-7229126a109d', service_id: '58a1cbec-972f-472b-8f2e-c4abe269f0e1' }, // Water Heater Service

  // Deep Electrical Solutions
  { provider_id: 'f8060271-7e4d-444c-bb0f-ce89d82c0490', service_id: 'efe8908a-69d7-44f9-b4e7-2d5399292f82' }, // Lighting Fixture
  { provider_id: 'f8060271-7e4d-444c-bb0f-ce89d82c0490', service_id: 'aa7cfe93-af7b-44ff-8edb-fd9d16203a91' }, // Outlet Installation
  { provider_id: 'f8060271-7e4d-444c-bb0f-ce89d82c0490', service_id: '3a158f18-1cca-4c75-9c12-5782164be786' }, // Panel Upgrade
  { provider_id: 'f8060271-7e4d-444c-bb0f-ce89d82c0490', service_id: 'b7037d92-bf79-4aa6-b81f-59a89cee74a6' }, // Wiring Repair

  // Deep Pest Control
  { provider_id: 'db377bd6-49a1-484b-a486-68bfc92148ba', service_id: '4e29444f-cacf-4d2a-8998-d5458a6480c4' }, // Insect Removal
  { provider_id: 'db377bd6-49a1-484b-a486-68bfc92148ba', service_id: '2664d704-dd57-4335-b9c1-2ed879df4c26' }, // Prevention Treatment
  { provider_id: 'db377bd6-49a1-484b-a486-68bfc92148ba', service_id: '1ac7adcd-c217-4701-89c4-c69e242b3c15' }, // Rodent Control
];

async function seed() {
  console.log(`Seeding ${ENTRIES.length} provider_services rows…`);

  const rows = ENTRIES.map(e => ({ ...e, is_active: true }));

  const { error } = await supabase
    .from('provider_services')
    .upsert(rows, { onConflict: 'provider_id,service_id', ignoreDuplicates: true });

  if (error) {
    console.error('Seed failed:', error.message);
    process.exit(1);
  }

  console.log('Done — provider_services seeded.');
}

seed();
