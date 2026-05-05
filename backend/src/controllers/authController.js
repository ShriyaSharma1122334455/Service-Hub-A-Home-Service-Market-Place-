import supabase from '../config/supabase.js';

export const register = async (req, res) => {
  try {
    const {
      email,
      password,
      role,
      fullName,
      phone,
      dob,
      street,
      city,
      state,
      zip,
    } = req.body || {};

    if (!email || !password || !fullName) {
      return res.status(400).json({
        success: false,
        message: 'email, password and fullName are required'
      });
    }

    const normalizedPhone = String(phone || '').replace(/\D/g, '');
    if (normalizedPhone.length < 10 || normalizedPhone.length > 15) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number.'
      });
    }

    if (!dob || typeof dob !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Must be 18 or older.'
      });
    }

    const parsedDob = new Date(dob);
    const dobIso = parsedDob.toISOString().slice(0, 10);
    const dobPattern = /^\d{4}-\d{2}-\d{2}$/;
    const today = new Date();
    let age = today.getFullYear() - parsedDob.getFullYear();
    const monthDiff = today.getMonth() - parsedDob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < parsedDob.getDate())) {
      age -= 1;
    }

    if (!dobPattern.test(dob) || Number.isNaN(parsedDob.getTime()) || age < 18) {
      return res.status(400).json({
        success: false,
        message: 'Must be 18 or older.'
      });
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;

    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        success: false,
        message:
          'Password must be at least 8 characters and include 1 uppercase, 1 lowercase, 1 number, and 1 special character'
      });
    }

    const roleLower = ['customer', 'provider'].includes(role) ? role : 'customer';

    // Step 1 — create user in auth.users
    const { data, error } = await supabase.auth.signUp({
      email: email.toLowerCase().trim(),
      password,
      email_confirm: true,
      options: {
        data: {
          role: roleLower,
          full_name: fullName.trim(),
          phone: phone || null,
          dob: dobIso,
        },
      },
    });

    if (error) {
      if (error.message?.toLowerCase().includes('already')) {
        return res.status(400).json({
          success: false,
          message: 'Email already registered'
        });
      }
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    // Step 2 — update user record in public.users (row is auto-created by db trigger on auth.users)
    const { data: newUser, error: userUpdateError } = await supabase
      .from('users')
      .update({
        full_name: fullName.trim(),
        email: email.toLowerCase().trim(),
        role: roleLower,
        phone: phone || null,
        dob: dobIso,
      })
      .eq('supabase_id', data.user.id)
      .select()
      .single();

    if (userUpdateError || !newUser) {
      return res.status(500).json({
        success: false,
        message: userUpdateError?.message || 'Failed to update user record'
      });
    }

    // Step 3 — insert address if provided
    if (street && city && state && zip) {
      const { error: addressError } = await supabase
        .from('addresses')
        .insert({
          user_id: newUser.id,
          label: 'home',
          street,
          city,
          state,
          zip,
          is_default: true,
        });

      if (addressError) {
        console.error('Address insert error:', addressError.message);
        // Do not block registration — just log it
      }
    }

    // Step 4 — create provider record if applicable
    if (roleLower === 'provider') {
      const { error: providerError } = await supabase
        .from('providers')
        .insert({
          user_id: newUser.id,
          business_name: fullName.trim(),
          description: 'Welcome to ServiceHub! Please complete your provider profile.',
          rating_avg: 0,
          rating_count: 0,
        });

      if (providerError) {
        console.error('Provider insert error:', providerError.message);
        return res.status(500).json({
          success: false,
          message: 'Failed to create provider profile'
        });
      }
    }

    return res.status(201).json({
      success: true,
      data: {
        token: data.session?.access_token || null,
        user: {
          id: data.user.id,
          email: data.user.email,
          role: data.user.user_metadata?.role || roleLower,
        },
        emailConfirmationRequired: !data.session,
      },
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ success: false, message: 'Failed to register' });
  }
};


export const login = async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase().trim(),
      password
    });

    if (error) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    return res.status(200).json({
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
    return res.status(500).json({ success: false, message: 'Failed to login' });
  }
};