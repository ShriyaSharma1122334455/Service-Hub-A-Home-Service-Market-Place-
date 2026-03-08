import Provider from "../models/Provider.js";
import mongoose from 'mongoose';



export const getProvider = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ success: false, error: 'Invalid ID format' });
    }
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
  data: { providers: list },
  pagination: {
    total: list.length,
    page: 1,
    limit: list.length
  }
});
  } catch (err) {
    console.error('Error fetching providers:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch providers'
    });
  }
}

/**
 * @description Advanced provider search with filters.
 * Supports: category, minRating, isActive, search (business name), page, limit.
 */
export const searchProviders = async (req, res) => {
  try {
    const { category, minRating, isActive, search, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (category)  filter.serviceCategories = category;
    if (minRating) filter.ratingAvg = { $gte: Number(minRating) };
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (search)    filter.businessName = { $regex: search, $options: 'i' };
    const skip = (Number(page) - 1) * Number(limit);
    const [providers, total] = await Promise.all([
      Provider.find(filter)
        .populate('userId', 'fullName email avatarUrl')
        .populate('serviceCategories', 'name')
        .skip(skip).limit(Number(limit)).lean(),
      Provider.countDocuments(filter),
    ]);
    const list = providers.map(p => ({
      _id: p._id, businessName: p.businessName, description: p.description,
      serviceCategories: p.serviceCategories, ratingAvg: p.ratingAvg,
      ratingCount: p.ratingCount, isActive: p.isActive,
      fullName: p.userId?.fullName, email: p.userId?.email, avatarUrl: p.userId?.avatarUrl,
    }));
    return res.json({ success: true, count: list.length, total, page: Number(page), data: { providers: list } });
  } catch (err) {
    console.error('searchProviders error:', err);
    res.status(500).json({ success: false, error: 'Failed to search providers' });
  }
};


