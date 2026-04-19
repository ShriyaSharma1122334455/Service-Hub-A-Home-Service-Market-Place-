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

    // Step 1 — create user in auth.users
    // DB trigger automatically creates the public.users row
    const { data, error } = await supabase.auth.admin.createUser({
      email: email.toLowerCase().trim(),
      password,
      email_confirm: true,
      user_metadata: {
        role: roleLower,
        full_name: fullName.trim()
      }
    });

    if (error) {
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

    // Step 2 — sign in immediately to get a session token
    // admin.createUser() does not return a session, so we call signInWithPassword
    const { data: sessionData, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase().trim(),
      password
    });

    if (signInError) {
      // User was created but session failed — still 201, but no token
      // Frontend should redirect to login in this case
      return res.status(201).json({
        success: true,
        data: {
          id: data.user.id,
          email: data.user.email,
          role: roleLower,
          sessionError: true
        }
      });
    }

    // Return same envelope shape as login() so frontend can handle both identically
    return res.status(201).json({
      success: true,
      data: {
        token: sessionData.session.access_token,
        user: {
          id: sessionData.user.id,
          email: sessionData.user.email,
          role: sessionData.user.user_metadata?.role || roleLower
        }
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