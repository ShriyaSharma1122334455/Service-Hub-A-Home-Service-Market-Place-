import AuthUser from '../models/AuthUser.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import UserModel from '../models/User.js';

const JWT_SECRET = process.env.JWT_SECRET || 'servicehub-test-secret';

export const register = async (req, res) => {
  try {
    const { name, email, password, role } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ success: false, error: 'Weak password' });
    }
    const existing = await AuthUser.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(400).json({ success: false, error: 'Email already registered' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await AuthUser.create({ name, email: email.toLowerCase().trim(), passwordHash, role: role || 'customer' });
    const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    return res.status(201).json({ success: true, token });
  } catch (err) {
    console.error('Auth register error:', err);
    return res.status(500).json({ success: false, error: 'Failed to register' });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ success: false, error: 'Missing credentials' });
    const user = await AuthUser.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(401).json({ success: false, error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ success: false, error: 'Invalid credentials' });
    const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ success: true, token });
  } catch (err) {
    console.error('Auth login error:', err);
    return res.status(500).json({ success: false, error: 'Failed to login' });
  }
};

export const me = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    const token = authHeader.split(' ')[1];
    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch (_err) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }
    const user = await AuthUser.findById(payload.id).lean();
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    return res.json({ success: true, data: { email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    console.error('Auth me error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch user' });
  }
};

/**
 * Creates a Supabase auth user (requires SUPABASE_SERVICE_ROLE_KEY) and
 * upserts the corresponding MongoDB profile. Returns the created profile.
 */
export const registerSupabase = async (req, res) => {
  try {
    const { name, email, password, role } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      return res.status(500).json({ success: false, error: 'Supabase admin credentials not configured' });
    }

    const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

    const roleLower = String(role || 'customer').toLowerCase();

    const { data, error: sbError } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { role: roleLower, fullName: name || undefined },
    });

    if (sbError) {
      console.error('Supabase createUser error:', sbError);
      return res.status(502).json({ success: false, error: 'Failed to create Supabase user', details: sbError.message || sbError });
    }

    const sbUser = data?.user;
    if (!sbUser) {
      return res.status(502).json({ success: false, error: 'Supabase did not return a user' });
    }

    const update = {
      supabaseId: sbUser.id,
      email: sbUser.email.toLowerCase(),
      fullName: name || sbUser.email.split('@')[0],
      role: roleLower,
    };

    const user = await UserModel.findOneAndUpdate(
      { supabaseId: sbUser.id },
      update,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    return res.status(201).json({ success: true, data: user });
  } catch (err) {
    console.error('registerSupabase error:', err);
    return res.status(500).json({ success: false, error: 'Failed to register user' });
  }
};

export default { register, login, me };
