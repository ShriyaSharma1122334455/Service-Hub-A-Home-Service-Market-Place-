import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import Provider from '../models/Provider.js';
import Category from '../models/Category.js';

dotenv.config();

const seedProviders = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const categories = await Category.find({});
    if (categories.length === 0) {
      console.log('❌ No categories found. Please run seedCategories.js first.');
      process.exit(1);
    }

    const plumbingCategory = categories.find(c => c.slug === 'plumbing');
    const electricianCategory = categories.find(c => c.slug === 'electrician');
    const cleaningCategory = categories.find(c => c.slug === 'cleaning');

    const providerUsers = await User.find({ role: 'provider' });
    if (providerUsers.length === 0) {
      console.log('❌ No provider users found. Please run seedUsers.js first.');
      process.exit(1);
    }

    await Provider.deleteMany({});
    console.log('🗑️  Cleared existing providers');

    const providers = [
      {
        userId: providerUsers[0]._id,
        businessName: 'Mike Johnson Plumbing',
        description: 'Professional plumbing services with over 10 years of experience. We handle leak repairs, pipe installation, drain cleaning, and water heater services. Available 24/7 for emergency services.',
        serviceCategories: [plumbingCategory._id],
        documents: {
          idDocument: null,
          selfie: null
        },
        verification: {
          idVerified: true,
          faceMatched: true,
          nsopwChecked: true,
          selfDeclared: true,
          verifiedAt: new Date(),
          rejectionReason: null
        },
        ratingAvg: 4.8,
        ratingCount: 42,
        isActive: true
      },
      {
        userId: providerUsers[1]._id,
        businessName: 'Spark Electric Co.',
        description: 'Licensed electrical services for residential and commercial properties. Specializing in wiring, outlet installation, panel upgrades, and lighting fixture installation. Safety is our top priority.',
        serviceCategories: [electricianCategory._id],
        documents: {
          idDocument: null,
          selfie: null
        },
        verification: {
          idVerified: true,
          faceMatched: true,
          nsopwChecked: true,
          selfDeclared: true,
          verifiedAt: new Date(),
          rejectionReason: null
        },
        ratingAvg: 4.9,
        ratingCount: 38,
        isActive: true
      },
      {
        userId: providerUsers[2]._id,
        businessName: 'Clean Pro Services',
        description: 'Professional cleaning services including deep cleaning, move-in/out cleaning, regular maintenance, and post-construction cleaning. We use eco-friendly products and guarantee satisfaction.',
        serviceCategories: [cleaningCategory._id],
        documents: {
          idDocument: null,
          selfie: null
        },
        verification: {
          idVerified: true,
          faceMatched: true,
          nsopwChecked: true,
          selfDeclared: true,
          verifiedAt: new Date(),
          rejectionReason: null
        },
        ratingAvg: 4.7,
        ratingCount: 56,
        isActive: true
      }
    ];

    const inserted = await Provider.insertMany(providers);
    console.log(`✅ Inserted ${inserted.length} providers:`);
    inserted.forEach(provider => {
      console.log(`   - ${provider.businessName} (Rating: ${provider.ratingAvg})`);
    });

    console.log('\n🎉 Provider seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding providers:', error);
    process.exit(1);
  }
};

seedProviders();
