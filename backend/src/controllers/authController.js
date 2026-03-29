import supabase from '../config/supabase.js';

export const register = async (req, res) => {
  try {
    const { email, password, role, fullName } = req.body || {};

    if (!email || !password || !fullName) {
      return res.status(400).json({ 
        success: false, 
        error: 'email, password and fullName are required' 
      });
    }

    if (password.length < 8) {
      return res.status(400).json({ 
        success: false, 
        error: 'Password must be at least 8 characters' 
      });
    }

    const roleLower = ['customer', 'provider'].includes(role) ? role : 'customer';

    // Creates user in auth.users
    // Database trigger automatically creates row in public.users
    const { data, error } = await supabase.auth.admin.createUser({
      email: email.toLowerCase().trim(),
      password,
      email_confirm: true,  // auto-confirm for now, change to false when email verification is ready
      user_metadata: {
        role: roleLower,
        full_name: fullName.trim()
      }
    });

    if (error) {
      // Supabase returns a specific message for duplicate emails
      if (error.message.includes('already registered')) {
        return res.status(400).json({ 
          success: false, 
          error: 'Email already registered' 
        });
      }
      return res.status(400).json({ 
        success: false, 
        error: error.message 
      });
    }

    return res.status(201).json({ 
      success: true, 
      data: {
        id: data.user.id,
        email: data.user.email,
        role: roleLower
      }
    });

  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ success: false, error: 'Failed to register' });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email and password are required' 
      });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase().trim(),
      password
    });

    if (error) {
      // Don't reveal whether email or password was wrong
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid credentials' 
      });
    }

    return res.json({
      success: true,
      data: {
        token: data.session.access_token,
        user: {
          id: data.user.id,
          email: data.user.email,
          role: data.user.user_metadata?.role || 'customer'
        }
      }
    });

  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, error: 'Failed to login' });
  }
};

export default { register, login };