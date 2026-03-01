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

    const categoryList = [
      categories.find(c => c.slug === 'plumbing'),
      categories.find(c => c.slug === 'electrician'),
      categories.find(c => c.slug === 'cleaning')
    ].filter(Boolean);
    const defaultCategory = categoryList[0] || categories[0];

    const providerUsers = await User.find({ role: 'provider' });
    if (providerUsers.length === 0) {
      console.log('❌ No provider users found. Please run seedUsers.js first.');
      process.exit(1);
    }

    await Provider.deleteMany({});
    console.log('🗑️  Cleared existing providers');

    const businessTemplates = [
      { businessName: 'Mike Johnson Plumbing', description: 'Professional plumbing services with over 10 years of experience. We handle leak repairs, pipe installation, drain cleaning, and water heater services. Available 24/7 for emergency services.', ratingAvg: 4.8, ratingCount: 42 },
      { businessName: 'Spark Electric Co.', description: 'Licensed electrical services for residential and commercial properties. Specializing in wiring, outlet installation, panel upgrades, and lighting fixture installation. Safety is our top priority.', ratingAvg: 4.9, ratingCount: 38 },
      { businessName: 'Clean Pro Services', description: 'Professional cleaning services including deep cleaning, move-in/out cleaning, regular maintenance, and post-construction cleaning. We use eco-friendly products and guarantee satisfaction.', ratingAvg: 4.7, ratingCount: 56 }
    ];

    const providers = providerUsers.map((user, index) => {
      const template = businessTemplates[index] || {
        businessName: `${user.fullName} Services`,
        description: 'Professional home services. Quality and reliability guaranteed.',
        ratingAvg: 4.5,
        ratingCount: 10
      };
      const category = categoryList[index % categoryList.length] || defaultCategory;
      return {
        userId: user._id,
        businessName: template.businessName,
        description: template.description,
        serviceCategories: category ? [category._id] : [],
        documents: { idDocument: null, selfie: null },
        verification: {
          idVerified: true,
          faceMatched: true,
          nsopwChecked: true,
          selfDeclared: true,
          verifiedAt: new Date(),
          rejectionReason: null
        },
        ratingAvg: template.ratingAvg,
        ratingCount: template.ratingCount,
        isActive: true
      };
    });

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
