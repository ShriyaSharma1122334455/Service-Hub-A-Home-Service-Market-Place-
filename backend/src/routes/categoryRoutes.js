import express from 'express';
import {
  getAllCategories,
  getCategoryById,
  getCategoryBySlug
} from '../controllers/categoryController.js';

const router = express.Router();

router.get('/', getAllCategories);
router.get('/:id', getCategoryById);
router.get('/slug/:slug', getCategoryBySlug);

export default router;
