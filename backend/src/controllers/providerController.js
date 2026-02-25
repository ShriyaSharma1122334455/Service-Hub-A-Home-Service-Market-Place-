import Provider from "../models/Provider.js";

export const getProvider = async (req, res) => {
    try {
        const { id } = req.params;
        const provider = await Provider.findById(id).select("businessName description serviceCategories ratingAvg ratingCount"); 
        
        if (!provider) {
            return res.status(404).json({
                success: false,
                error: 'Provider not found'
            });
        }
        
        res.json({
            success: true,
            data: provider
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
        .select('businessName description serviceCategories ratingAvg ratingCount')
        .lean();

    return res.json({
      success: true,
      providers
    });
  } catch (err) {
    console.error('Error fetching providers:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch providers'
    });
  }
}
