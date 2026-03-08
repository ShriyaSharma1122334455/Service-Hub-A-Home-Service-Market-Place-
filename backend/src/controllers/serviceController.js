/**
 * @fileoverview Service controller — CRUD operations + search/filter.
 * @module controllers/serviceController
 */
import Service from '../models/Service.js';
 
/** List services with optional search and filter */
export const listServices = async (req, res) => {
  try {
    const { category, minPrice, maxPrice, search, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (category)  filter.categoryId = category;
    if (search)    filter.name = { $regex: search, $options: 'i' };
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [services, total] = await Promise.all([
      Service.find(filter).populate('categoryId', 'name').skip(skip).limit(Number(limit)).lean(),
      Service.countDocuments(filter),
    ]);
    return res.json({ success: true, count: services.length, total, page: Number(page), data: services });
  } catch (err) {
    console.error('listServices error:', err);
    res.status(500).json({ success: false, error: 'Failed to list services' });
  }
};
 
/** Get single service by ID */
export const getService = async (req, res) => {
  try {
    const service = await Service.findById(req.params.id).populate('categoryId','name').lean();
    if (!service) return res.status(404).json({ success: false, error: 'Service not found' });
    res.json({ success: true, data: service });
  } catch (_err) {
    res.status(500).json({ success: false, error: 'Failed to fetch service' });
  }
};
 
/** Create service — provider only */
export const createService = async (req, res) => {
  try {
    const service = await Service.create({ ...req.body, providerId: req.user.id });
    res.status(201).json({ success: true, data: service });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};
 
/** Update service — provider only */
export const updateService = async (req, res) => {
  try {
    const service = await Service.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!service) return res.status(404).json({ success: false, error: 'Service not found' });
    res.json({ success: true, data: service });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};
 
/** Delete service — provider only */
export const deleteService = async (req, res) => {
  try {
    const service = await Service.findByIdAndDelete(req.params.id);
    if (!service) return res.status(404).json({ success: false, error: 'Service not found' });
    res.json({ success: true, message: 'Service deleted' });
  } catch (_err) {
    res.status(500).json({ success: false, error: 'Failed to delete service' });
  }
};

