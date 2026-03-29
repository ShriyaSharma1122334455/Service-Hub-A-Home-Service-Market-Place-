import express from 'express';
import { listProviders, getProvider, searchProviders, getProvidersByService } from '../controllers/providerController.js';

const router = express.Router();

// All provider browse routes are PUBLIC
router.get('/',                        listProviders);          // simple list
router.get('/search',                  searchProviders);        // filtered search
router.get('/by-service/:serviceId',   getProvidersByService);  // providers offering a specific service
router.get('/:id',                     getProvider);            // single provider (must be last — catches all IDs)

export default router;