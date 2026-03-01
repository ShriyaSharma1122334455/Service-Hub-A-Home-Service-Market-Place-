import express from 'express';
import { getMe, getUser, listUsers } from '../controllers/userController.js';
import { getProvider, listProviders } from '../controllers/providerController.js';

const router = express.Router();

router.get('/me', getMe);
router.get('/user/:id', getUser);
router.get('/users', listUsers);
router.get('/providers', listProviders);
router.get('/provider/:id', getProvider);

export default router;
