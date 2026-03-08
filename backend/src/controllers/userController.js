import User from "../models/User.js";
import Provider from "../models/Provider.js";

export const getMe = async (req, res) => {
  try {
    const email = req.user?.email || req.headers['x-user-email'];
    if (!email) {
      return res.status(400).json({ success: false, error: 'Authenticated user email required' });
    }
    const user = await User.findOne({ email: email.toLowerCase().trim() })
      .select('_id supabaseId fullName email avatarUrl role')
      .lean();
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    if (user.role === 'provider') {
      const provider = await Provider.findOne({ userId: user._id })
        .select('businessName description serviceCategories ratingAvg ratingCount')
        .lean();
      if (!provider) {
        return res.status(404).json({ success: false, error: 'Provider profile not found' });
      }
      const providerData = {
        type: 'provider',
        _id: provider._id,
        businessName: provider.businessName,
        description: provider.description,
        serviceCategories: provider.serviceCategories,
        ratingAvg: provider.ratingAvg,
        ratingCount: provider.ratingCount,
        fullName: user.fullName,
        email: user.email,
        avatarUrl: user.avatarUrl,
        role: user.role,
      };
      return res.json({ success: true, data: providerData });
    }
    const userData = { type: 'user', ...user };
    return res.json({ success: true, data: userData });
  } catch (err) {
    console.error('Error fetching me:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch profile' });
  }
};

export const getUser = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findById(id).select('supabaseId fullName avatarUrl role bio provider.services provider.rating'); 
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        
        res.json({
            success: true,
            data: user
        });
    }
    catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch profile'
        });
    }
}

export const listUsers = async (req, res) => {
  try {
    const users = await User.find({ role: 'customer' })
        .select('_id supabaseId fullName avatarUrl role email')
        .lean();

    return res.json({
      success: true,
      data: { users }
    });
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users'
    });
  }
}
