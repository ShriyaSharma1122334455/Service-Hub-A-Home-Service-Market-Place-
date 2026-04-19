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

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;

if (!passwordRegex.test(password)) {
  return res.status(400).json({
    success: false,
    error:
      'Password must be at least 8 characters and include 1 uppercase, 1 lowercase, 1 number, and 1 special character'
  });
}

    const roleLower = ['customer', 'provider'].includes(role) ? role : 'customer';

    // Step 1 — create user in auth.users
    // DB trigger automatically creates the public.users row
    const { data, error } = await supabase.auth.signUp({
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

    return res.status(201).json({
      success: true,
      data: {
        // 🔥 CHANGE 4: handle case when session might be null (email confirmation ON)
        token: data.session?.access_token || null,
        user: {
          id: data.user.id,
          email: data.user.email,
          role: data.user.user_metadata?.role || roleLower
        },
        // 🔥 CHANGE 5: inform frontend if email verification is required
        emailConfirmationRequired: !data.session
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