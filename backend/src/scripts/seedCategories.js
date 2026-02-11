import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Category from '../models/Category.js';

dotenv.config();

const categories = [
  {
    name: 'Plumbing',
    slug: 'plumbing',  // Add slug manually
    description: 'Professional plumbing services including leak repairs, pipe installation, drain cleaning, and water heater services.',
    icon: 'plumbing-icon.svg'
  },
  {
    name: 'Electrician',
    slug: 'electrician',  // Add slug manually
    description: 'Licensed electrical services including wiring, outlet installation, panel upgrades, and lighting fixture installation.',
    icon: 'electrical-icon.svg'
  },
  {
    name: 'Cleaning',
    slug: 'cleaning',  // Add slug manually
    description: 'Professional cleaning services including deep cleaning, move-in/out cleaning, and regular maintenance.',
    icon: 'cleaning-icon.svg'
  },
  {
    name: 'Pest Control',
    slug: 'pest-control',  // Add slug manually
    description: 'Expert pest control services including insect removal, rodent control, and prevention treatments.',
    icon: 'pest-control-icon.svg'
  }
];

const seedCategories = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Clear existing categories
    await Category.deleteMany({});
    console.log('🗑️  Cleared existing categories');

    // Insert new categories
    const inserted = await Category.insertMany(categories);
    console.log(`✅ Inserted ${inserted.length} categories:`);
    inserted.forEach(cat => {
      console.log(`   - ${cat.name} (${cat.slug})`);
    });

    console.log('\n🎉 Seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding categories:', error);
    process.exit(1);
  }
};

seedCategories();