/**
 * backend/tests/search-filter.test.js
 * Integration tests for Search & Filter API endpoints
 *   GET /api/providers/search  – category, location, keyword, minRating
 *   GET /api/services          – category, location, keyword, price range
 * Run: npm test
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../server.js';
import Provider from '../models/Provider.js';
import Service from '../models/Service.js';

let mongod;
let categoryId;
let userId;

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  // Insert category directly — bypasses pre-save hook (safe for seed data)
  const now = new Date();
  const catResult = await mongoose.connection.collection('categories').insertOne({
    name: 'Plumbing', slug: 'plumbing', description: 'Plumbing services',
    icon: 'default-icon.svg', isActive: true, createdAt: now, updatedAt: now,
  });
  categoryId = catResult.insertedId;

  // Insert user directly — bypasses Supabase auth hooks used in production
  const userResult = await mongoose.connection.collection('users').insertOne({
    fullName: 'Test Provider', email: `seed_${Date.now()}@example.com`,
    supabaseId: `supabase-seed-${Date.now()}`, role: 'provider',
    verificationStatus: 'pending', isActive: true, addresses: [],
    createdAt: now, updatedAt: now,
  });
  userId = userResult.insertedId;

  // Seed providers with varying location, businessName, category, ratingAvg
  await Provider.create([
    {
      userId,
      businessName: 'AquaFix Plumbing',
      description: 'Expert plumbing',
      location: 'New York, NY',
      serviceCategories: [categoryId],
      ratingAvg: 4.8,
      isActive: true,
    },
    {
      userId: new mongoose.Types.ObjectId(), // different user placeholder
      businessName: 'City Electricians',
      description: 'Electrical work',
      location: 'Los Angeles, CA',
      serviceCategories: [],
      ratingAvg: 4.2,
      isActive: true,
    },
    {
      userId: new mongoose.Types.ObjectId(),
      businessName: 'NYC Handyman',
      description: 'General repairs',
      location: 'New York, NY',
      serviceCategories: [categoryId],
      ratingAvg: 3.5,
      isActive: false,
    },
  ]);

  // Seed a provider doc for services (needs valid ObjectId)
  const providerDoc = await Provider.findOne({ businessName: 'AquaFix Plumbing' });

  // Seed services
  await Service.create([
    {
      providerId: providerDoc._id,
      categoryId,
      name: 'Pipe Repair',
      description: 'Fix leaking pipes',
      basePrice: 150,
      durationMinutes: 60,
      location: 'New York, NY',
      isActive: true,
    },
    {
      providerId: providerDoc._id,
      categoryId,
      name: 'Drain Cleaning',
      description: 'Unclog drains',
      basePrice: 80,
      durationMinutes: 30,
      location: 'Brooklyn, NY',
      isActive: true,
    },
    {
      providerId: providerDoc._id,
      categoryId,
      name: 'Water Heater Install',
      description: 'Install new water heater',
      basePrice: 400,
      durationMinutes: 120,
      location: 'Los Angeles, CA',
      isActive: true,
    },
  ]);
}, 30000);

afterAll(async () => {
  await mongoose.connection.close();
  await mongod.stop();
});

// ─── 1. Provider Search – keyword ─────────────────────────────────────────────

describe('GET /api/providers/search – keyword', () => {
  it('returns providers matching business name keyword', async () => {
    const res = await request(app).get('/api/providers/search?search=aqua');
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.providers.length).toBeGreaterThan(0);
    expect(
      res.body.data.providers.every(p =>
        p.businessName.toLowerCase().includes('aqua')
      )
    ).toBe(true);
  });

  it('returns empty array for no keyword match', async () => {
    const res = await request(app).get('/api/providers/search?search=xyznonexistent');
    expect(res.statusCode).toBe(200);
    expect(res.body.data.providers).toHaveLength(0);
  });

  it('keyword search is case-insensitive', async () => {
    const res = await request(app).get('/api/providers/search?search=AQUA');
    expect(res.statusCode).toBe(200);
    expect(res.body.data.providers.length).toBeGreaterThan(0);
  });
});

// ─── 2. Provider Search – location ────────────────────────────────────────────

describe('GET /api/providers/search – location', () => {
  it('returns providers in a specific location', async () => {
    const res = await request(app).get('/api/providers/search?location=New York');
    expect(res.statusCode).toBe(200);
    expect(res.body.data.providers.length).toBeGreaterThan(0);
    expect(
      res.body.data.providers.every(p =>
        p.location?.toLowerCase().includes('new york')
      )
    ).toBe(true);
  });

  it('location filter is case-insensitive', async () => {
    const res = await request(app).get('/api/providers/search?location=new york');
    expect(res.statusCode).toBe(200);
    expect(res.body.data.providers.length).toBeGreaterThan(0);
  });

  it('returns empty for unknown location', async () => {
    const res = await request(app).get('/api/providers/search?location=Atlantis');
    expect(res.statusCode).toBe(200);
    expect(res.body.data.providers).toHaveLength(0);
  });
});

// ─── 3. Provider Search – category ────────────────────────────────────────────

describe('GET /api/providers/search – category', () => {
  it('returns providers matching a category id', async () => {
    const res = await request(app).get(`/api/providers/search?category=${categoryId}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.providers.length).toBeGreaterThan(0);
  });

  it('returns empty for an unknown category id', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app).get(`/api/providers/search?category=${fakeId}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.providers).toHaveLength(0);
  });
});

// ─── 4. Provider Search – minRating ──────────────────────────────────────────

describe('GET /api/providers/search – minRating', () => {
  it('returns only providers at or above minRating', async () => {
    const res = await request(app).get('/api/providers/search?minRating=4.5');
    expect(res.statusCode).toBe(200);
    expect(res.body.data.providers.every(p => p.ratingAvg >= 4.5)).toBe(true);
  });
});

// ─── 5. Provider Search – combined filters ────────────────────────────────────

describe('GET /api/providers/search – combined filters', () => {
  it('supports keyword + location together', async () => {
    const res = await request(app).get('/api/providers/search?search=aqua&location=New York');
    expect(res.statusCode).toBe(200);
    expect(res.body.data.providers.length).toBeGreaterThan(0);
    expect(res.body.data.providers[0].businessName.toLowerCase()).toContain('aqua');
    expect(res.body.data.providers[0].location.toLowerCase()).toContain('new york');
  });

  it('returns pagination metadata', async () => {
    const res = await request(app).get('/api/providers/search');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('count');
    expect(res.body).toHaveProperty('page');
  });
});

// ─── 6. Provider Search – isActive filter ────────────────────────────────────

describe('GET /api/providers/search – isActive filter', () => {
  it('returns only active providers when isActive=true', async () => {
    const res = await request(app).get('/api/providers/search?isActive=true');
    expect(res.statusCode).toBe(200);
    expect(res.body.data.providers.every(p => p.isActive === true)).toBe(true);
  });
});

// ─── 7. Service List – keyword ────────────────────────────────────────────────

describe('GET /api/services – keyword search', () => {
  it('returns services matching name keyword', async () => {
    const res = await request(app).get('/api/services?search=pipe');
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBeGreaterThan(0);
    expect(
      res.body.data.every(s => s.name.toLowerCase().includes('pipe'))
    ).toBe(true);
  });

  it('keyword search is case-insensitive', async () => {
    const res = await request(app).get('/api/services?search=PIPE');
    expect(res.statusCode).toBe(200);
    expect(res.body.count).toBeGreaterThan(0);
  });

  it('returns empty for no match', async () => {
    const res = await request(app).get('/api/services?search=xyznonexistent');
    expect(res.statusCode).toBe(200);
    expect(res.body.count).toBe(0);
  });
});

// ─── 8. Service List – location ───────────────────────────────────────────────

describe('GET /api/services – location filter', () => {
  it('returns services in a specific location', async () => {
    const res = await request(app).get('/api/services?location=Brooklyn');
    expect(res.statusCode).toBe(200);
    expect(res.body.count).toBeGreaterThan(0);
    expect(
      res.body.data.every(s => s.location?.toLowerCase().includes('brooklyn'))
    ).toBe(true);
  });

  it('location filter is case-insensitive', async () => {
    const res = await request(app).get('/api/services?location=brooklyn');
    expect(res.statusCode).toBe(200);
    expect(res.body.count).toBeGreaterThan(0);
  });

  it('returns empty for unknown location', async () => {
    const res = await request(app).get('/api/services?location=Atlantis');
    expect(res.statusCode).toBe(200);
    expect(res.body.count).toBe(0);
  });
});

// ─── 9. Service List – category filter ───────────────────────────────────────

describe('GET /api/services – category filter', () => {
  it('returns services matching a category id', async () => {
    const res = await request(app).get(`/api/services?category=${categoryId}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.count).toBeGreaterThan(0);
  });
});

// ─── 10. Service List – combined filters ─────────────────────────────────────

describe('GET /api/services – combined filters', () => {
  it('supports keyword + location together', async () => {
    const res = await request(app).get('/api/services?search=pipe&location=New York');
    expect(res.statusCode).toBe(200);
    expect(res.body.count).toBeGreaterThan(0);
  });

  it('returns pagination metadata', async () => {
    const res = await request(app).get('/api/services');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('count');
    expect(res.body).toHaveProperty('page');
  });
});
