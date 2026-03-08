import UserModel from '../models/User.js';

export const syncUser = async (req, res) => {
  try {
    const supabaseId = req.user?.supabaseId || req.user?.id;
    const email = req.user?.email;
    if (!supabaseId || !email) {
      return res.status(400).json({ success: false, error: 'Missing authenticated user' });
    }

    const { fullName, phone, avatarUrl, role } = req.body || {};

    const update = {
      supabaseId,
      email: email.toLowerCase(),
      fullName: fullName || email.split('@')[0],
      phone: phone || undefined,
      avatarUrl: avatarUrl || null,
      role: role || 'customer'
    };

    const user = await UserModel.findOneAndUpdate(
      { supabaseId },
      update,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    return res.json({ success: true, data: user });
  } catch (err) {
    console.error('Error syncing user:', err);
    return res.status(500).json({ success: false, error: 'Failed to sync user' });
  }
};

export default { syncUser };
