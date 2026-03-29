import express from 'express';
import { listServices, getService, createService, updateService, deleteService }
  from '../controllers/serviceController.js';
import { authenticate, requireRole } from '../middleware/authMiddleware.js';
 
const router = express.Router();
 
// Public routes
router.get('/',    listServices);
router.get('/:id', getService);
 
// Protected — provider only
router.post('/',    authenticate, requireRole('provider'), createService);
router.put('/:id',  authenticate, requireRole('provider'), updateService);
router.delete('/:id', authenticate, requireRole('provider'), deleteService);
 
export default router;