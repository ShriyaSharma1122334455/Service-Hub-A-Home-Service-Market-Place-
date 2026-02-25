import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';

dotenv.config();

const users = [
  {
    supabaseId: 'seed-customer-001',
    email: 'john.doe@example.com',
    role: 'customer',
    fullName: 'John Doe',
    phone: '+1-555-0101',
    avatarUrl: null,
    addresses: [
      {
        label: 'Home',
        street: '123 Main St',
        city: 'New York',
        state: 'NY',
        zip: '10001',
        isDefault: true
      }
    ],
    verificationStatus: 'verified',
    isActive: true
  },
  {
    supabaseId: 'seed-customer-002',
    email: 'jane.smith@example.com',
    role: 'customer',
    fullName: 'Jane Smith',
    phone: '+1-555-0102',
    avatarUrl: null,
    addresses: [
      {
        label: 'Home',
        street: '456 Oak Ave',
        city: 'Los Angeles',
        state: 'CA',
        zip: '90001',
        isDefault: true
      }
    ],
    verificationStatus: 'verified',
    isActive: true
  },
  {
    supabaseId: 'seed-provider-001',
    email: 'mike.plumber@example.com',
    role: 'provider',
    fullName: 'Mike Johnson',
    phone: '+1-555-0201',
    avatarUrl: null,
    addresses: [
      {
        label: 'Business',
        street: '789 Service Rd',
        city: 'Chicago',
        state: 'IL',
        zip: '60601',
        isDefault: true
      }
    ],
    verificationStatus: 'verified',
    isActive: true
  },
  {
    supabaseId: 'seed-provider-002',
    email: 'sarah.spark@example.com',
    role: 'provider',
    fullName: 'Sarah Spark',
    phone: '+1-555-0202',
    avatarUrl: null,
    addresses: [
      {
        label: 'Business',
        street: '321 Electric Blvd',
        city: 'Houston',
        state: 'TX',
        zip: '77001',
        isDefault: true
      }
    ],
    verificationStatus: 'verified',
    isActive: true
  },
  {
    supabaseId: 'seed-provider-003',
    email: 'clean.pro@example.com',
    role: 'provider',
    fullName: 'Clean Pro Services',
    phone: '+1-555-0203',
    avatarUrl: null,
    addresses: [
      {
        label: 'Business',
        street: '555 Clean St',
        city: 'Miami',
        state: 'FL',
        zip: '33101',
        isDefault: true
      }
    ],
    verificationStatus: 'verified',
    isActive: true
  },
  {
    supabaseId: 'seed-admin-001',
    email: 'admin@example.com',
    role: 'admin',
    fullName: 'Admin User',
    phone: '+1-555-0100',
    avatarUrl: null,
    addresses: [],
    verificationStatus: 'verified',
    isActive: true
  }
];

const seedUsers = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    await User.deleteMany({});
    console.log('🗑️  Cleared existing users');

    const inserted = await User.insertMany(users);
    console.log(`✅ Inserted ${inserted.length} users:`);
    inserted.forEach(user => {
      console.log(`   - ${user.fullName} (${user.email}) - ${user.role}`);
    });

    console.log('\n🎉 User seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding users:', error);
    process.exit(1);
  }
};

seedUsers();
