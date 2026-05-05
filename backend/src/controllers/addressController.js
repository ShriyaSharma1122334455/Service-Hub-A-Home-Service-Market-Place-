import supabase from '../config/supabase.js';

export const createAddress = async (req, res) => {
  try {
    const { label, street, city, state, zip, is_default } = req.body || {};
    const supabaseId = req.user?.id;

    if (!supabaseId) {
      return res.status(401).json({ success: false, error: 'Authenticated user required' });
    }

    if (!street || !city || !state || !zip) {
      return res.status(400).json({
        success: false,
        error: 'street, city, state, zip are required'
      });
    }

    // Get the user record to get the users.id
    const { data: userRecord, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('supabase_id', supabaseId)
      .single();

    if (userError || !userRecord) {
      return res.status(400).json({
        success: false,
        error: 'User record not found'
      });
    }

    const { data, error } = await supabase
      .from('addresses')
      .insert({
        user_id: userRecord.id,
        label: label || 'home',
        street,
        city,
        state,
        zip,
        is_default: is_default ?? true,
      })
      .select()
      .single();

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    return res.status(201).json({ success: true, data });
  } catch (err) {
    console.error('Create address error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create address' });
  }
};