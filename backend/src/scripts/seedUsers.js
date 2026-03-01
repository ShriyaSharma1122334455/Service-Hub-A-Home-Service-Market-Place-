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
    supabaseId: 'seed-customer-003',
    email: 'robert.wilson@example.com',
    role: 'customer',
    fullName: 'Robert Wilson',
    phone: '+1-555-0103',
    avatarUrl: null,
    addresses: [
      {
        label: 'Home',
        street: '789 Pine St',
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
    supabaseId: 'seed-customer-004',
    email: 'emily.brown@example.com',
    role: 'customer',
    fullName: 'Emily Brown',
    phone: '+1-555-0104',
    avatarUrl: null,
    addresses: [
      {
        label: 'Home',
        street: '321 Elm Ave',
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
    supabaseId: 'seed-customer-005',
    email: 'david.lee@example.com',
    role: 'customer',
    fullName: 'David Lee',
    phone: '+1-555-0105',
    avatarUrl: null,
    addresses: [
      {
        label: 'Home',
        street: '555 Maple Dr',
        city: 'Phoenix',
        state: 'AZ',
        zip: '85001',
        isDefault: true
      }
    ],
    verificationStatus: 'verified',
    isActive: true
  },
  {
    supabaseId: 'seed-test-user',
    email: 'user@test.com',
    role: 'customer',
    fullName: 'Test User',
    phone: null,
    avatarUrl: null,
    addresses: [],
    verificationStatus: 'verified',
    isActive: true
  },
  {
    supabaseId: 'seed-test-provider',
    email: 'provider@test.com',
    role: 'provider',
    fullName: 'Test Provider',
    phone: null,
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
