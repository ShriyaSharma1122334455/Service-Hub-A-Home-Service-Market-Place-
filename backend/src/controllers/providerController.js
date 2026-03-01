import Provider from "../models/Provider.js";

export const getProvider = async (req, res) => {
    try {
        const { id } = req.params;
        const provider = await Provider.findById(id)
            .select("businessName description serviceCategories ratingAvg ratingCount userId")
            .populate("userId", "fullName email avatarUrl role")
            .lean();

        if (!provider) {
            return res.status(404).json({
                success: false,
                error: 'Provider not found'
            });
        }

        const user = provider.userId;
        const data = {
            _id: provider._id,
            businessName: provider.businessName,
            description: provider.description,
            serviceCategories: provider.serviceCategories,
            ratingAvg: provider.ratingAvg,
            ratingCount: provider.ratingCount,
            fullName: user?.fullName || provider.businessName,
            email: user?.email,
            avatarUrl: user?.avatarUrl,
            role: user?.role || 'provider',
        };

        res.json({
            success: true,
            data
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

export const listProviders = async (req, res) => {
  try {
    const providers = await Provider.find({})
        .select('businessName description serviceCategories ratingAvg ratingCount userId')
        .populate("userId", "fullName email avatarUrl")
        .lean();

    const list = providers.map((p) => {
        const user = p.userId;
        return {
            _id: p._id,
            businessName: p.businessName,
            description: p.description,
            serviceCategories: p.serviceCategories,
            ratingAvg: p.ratingAvg,
            ratingCount: p.ratingCount,
            fullName: user?.fullName || p.businessName,
            email: user?.email,
            avatarUrl: user?.avatarUrl,
        };
    });

    return res.json({
      success: true,
      data: { providers: list }
    });
  } catch (err) {
    console.error('Error fetching providers:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch providers'
    });
  }
}
