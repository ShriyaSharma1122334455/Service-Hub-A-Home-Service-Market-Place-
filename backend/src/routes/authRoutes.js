import express from 'express';
import { register, login, me, registerSupabase } from '../controllers/authController.js';

const router = express.Router();

router.post('/register', register);
router.post('/register-supabase', registerSupabase);
router.post('/login', login);
router.get('/me', me);

export default router;
