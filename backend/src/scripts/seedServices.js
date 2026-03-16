import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Category from '../models/Category.js';
import Provider from '../models/Provider.js';
import Service from '../models/Service.js';

dotenv.config();

/**
 * Platform-defined services — NOT tied to any specific provider.
 * Each service has a subCategory for grouping inside the catalog modal.
 */
const serviceData = {
  cleaning: [
    {
      name: 'Regular Home Cleaning',
      subCategory: 'Home Cleaning',
      description: 'Thorough cleaning of all rooms including dusting, vacuuming, mopping, and sanitising bathrooms and kitchen surfaces. Perfect for weekly or fortnightly upkeep.',
      basePrice: 80,
      durationMinutes: 120,
    },
    {
      name: 'Deep Cleaning',
      subCategory: 'Home Cleaning',
      description: 'Intensive top-to-bottom clean covering inside appliances, behind furniture, grout scrubbing, and full kitchen degreasing. Ideal for seasonal cleans or moving in/out.',
      basePrice: 150,
      durationMinutes: 240,
    },
    {
      name: 'Move-in / Move-out Cleaning',
      subCategory: 'End of Tenancy',
      description: 'Comprehensive end-of-tenancy clean to leave the property spotless. Includes inside cabinets, windows, oven, and all fixtures. Meets landlord inspection standards.',
      basePrice: 200,
      durationMinutes: 300,
    },
  ],
  plumbing: [
    {
      name: 'Leak Detection & Repair',
      subCategory: 'Leak & Pipe',
      description: 'Identify and fix leaking pipes, taps, or joints. Includes pressure testing and minor pipe replacement where needed. Prevents water damage and reduces bills.',
      basePrice: 120,
      durationMinutes: 60,
    },
    {
      name: 'Drain Unclogging',
      subCategory: 'Drainage',
      description: 'Clear blocked drains in sinks, showers, or tubs using professional tools. Includes a post-clear flush and drain health check to prevent future blockages.',
      basePrice: 90,
      durationMinutes: 45,
    },
    {
      name: 'Water Heater Installation',
      subCategory: 'Installation',
      description: 'Supply and install a new water heater (tank or tankless). Covers disconnection of old unit, safe disposal, full installation, and commissioning test.',
      basePrice: 350,
      durationMinutes: 180,
    },
  ],
  electrical: [
    {
      name: 'Outlet Installation',
      subCategory: 'Installation',
      description: 'Install new power outlets in any room. Fully compliant with local electrical codes. Includes wall cut-out, wiring, outlet fitting, and safety testing.',
      basePrice: 75,
      durationMinutes: 60,
    },
    {
      name: 'Ceiling Fan Installation',
      subCategory: 'Installation',
      description: 'Install or replace a ceiling fan with full wiring and mounting. Includes balancing, speed control setup, and a final safety inspection.',
      basePrice: 100,
      durationMinutes: 90,
    },
    {
      name: 'Electrical Panel Inspection',
      subCategory: 'Inspection',
      description: 'Full inspection of your breaker panel for overloading, faulty breakers, and code violations. Comes with a detailed safety report and recommended action plan.',
      basePrice: 150,
      durationMinutes: 120,
    },
  ],
  'pest-control': [
    {
      name: 'General Pest Treatment',
      subCategory: 'Pest Treatment',
      description: 'Targeted treatment for common household pests including ants, cockroaches, silverfish, and spiders. Safe for children and pets once dry. Includes a 30-day follow-up guarantee.',
      basePrice: 130,
      durationMinutes: 90,
    },
    {
      name: 'Rodent Control',
      subCategory: 'Wildlife & Rodents',
      description: 'Professional inspection, baiting, and entry-point sealing to eliminate mice and rats. Includes a full property survey and recommendations to prevent re-entry.',
      basePrice: 180,
      durationMinutes: 120,
    },
    {
      name: 'Termite Inspection',
      subCategory: 'Inspection',
      description: 'Comprehensive termite inspection using moisture meters and thermal imaging. Provides a detailed report on activity, risk zones, and treatment options.',
      basePrice: 100,
      durationMinutes: 60,
    },
  ],
};

const seedServices = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Fetch categories by slug
    const categories = await Category.find({});
    if (categories.length === 0) {
      console.log('❌ No categories found. Run seedCategories.js first.');
      process.exit(1);
    }

    const categoryMap = {};
    categories.forEach((cat) => {
      categoryMap[cat.slug] = cat._id;
    });

    // Clear existing services
    await Service.deleteMany({});
    console.log('🗑️  Cleared existing services');

    // Build service documents (no providerId — platform-defined)
    const toInsert = [];
    for (const [slug, services] of Object.entries(serviceData)) {
      const categoryId = categoryMap[slug];
      if (!categoryId) {
        console.log(`⚠️  Category with slug '${slug}' not found — skipping`);
        continue;
      }
      services.forEach((svc) => {
        toInsert.push({ ...svc, categoryId, isActive: true });
      });
    }

    const inserted = await Service.insertMany(toInsert);
    console.log(`✅ Inserted ${inserted.length} platform services:`);
    inserted.forEach((svc) => console.log(`   - [${svc.subCategory}] ${svc.name} ($${svc.basePrice})`));

    // ── Seed servicesOffered on existing providers ───────────────────────────
    // Each provider gets the services that belong to their serviceCategories.
    const providers = await Provider.find({});
    if (providers.length === 0) {
      console.log('\n⚠️  No providers found — skipping servicesOffered update.');
      console.log('   Run seedUsers.js + seedProviders.js first, then re-run this script.');
    } else {
      console.log(`\n🔗 Linking services to ${providers.length} provider(s)...`);
      for (const provider of providers) {
        const providerCategoryIds = provider.serviceCategories.map((c) => c.toString());
        const relevant = inserted.filter((svc) =>
          providerCategoryIds.includes(svc.categoryId.toString())
        );
        await Provider.findByIdAndUpdate(provider._id, {
          servicesOffered: relevant.map((svc) => ({ serviceId: svc._id })),
        });
        console.log(`   - ${provider.businessName}: linked ${relevant.length} service(s)`);
      }
    }

    console.log('\n🎉 Service seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding services:', error);
    process.exit(1);
  }
};

seedServices();
