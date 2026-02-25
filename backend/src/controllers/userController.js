import User from "../models/User.js";

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
    const users = await User.find({})
        .select('supabaseId fullName avatarUrl role bio provider.services provider.rating')
        .lean();

    return res.json({
      success: true,
      users
    });
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users'
    });
  }
}
