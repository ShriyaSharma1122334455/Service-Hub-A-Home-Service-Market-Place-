import supabase from '../config/supabase.js';

// Get all categories
export const getAllCategories = async (req, res) => {
  try {
    const { data: categories, error } = await supabase
      .from('categories')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    res.json({
      success: true,
      count: categories.length,
      data: categories
    });

  } catch (err) {
    console.error('Error fetching categories:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch categories' });
  }
};

// Get category by ID
export const getCategoryById = async (req, res) => {
  try {
    const { id } = req.params;

    const { data: category, error } = await supabase
      .from('categories')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !category) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }

    res.json({ success: true, data: category });

  } catch (err) {
    console.error('Error fetching category:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch category' });
  }
};

// Get category by slug
export const getCategoryBySlug = async (req, res) => {
  try {
    const { slug } = req.params;

    const { data: category, error } = await supabase
      .from('categories')
      .select('*')
      .eq('slug', slug)
      .eq('is_active', true)
      .single();

    if (error || !category) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }

    res.json({ success: true, data: category });

  } catch (err) {
    console.error('Error fetching category:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch category' });
  }
};

export default { getAllCategories, getCategoryById, getCategoryBySlug };