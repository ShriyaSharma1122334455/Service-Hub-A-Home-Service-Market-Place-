import express from 'express';
import { listProviders, getProvider, searchProviders } from '../controllers/providerController.js';
 
const router = express.Router();
 
// All provider browse routes are PUBLIC
router.get('/',        listProviders);     // simple list
router.get('/search',  searchProviders);   // filtered search
router.get('/:id',     getProvider);       // single provider
 
export default router;
