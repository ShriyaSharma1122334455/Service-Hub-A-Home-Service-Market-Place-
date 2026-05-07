import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { checkSupabaseConnection } from './config/supabase.js';
import { validateVdaServiceConfig, validateVdaAuthConfig } from './config/vdaServiceConfig.js';
import { startReminderCron } from './services/reminderService.js';
import { startAutoCompleteCron } from './services/autoCompleteService.js';
import categoryRoutes from './routes/categoryRoutes.js';
import serviceRoutes from './routes/serviceRoutes.js';
import profileRoutes from './routes/profileRoutes.js';
import providerRoutes from './routes/providerRoutes.js';
import bookingRoutes from './routes/bookingRoutes.js';
import complaintRoutes from './routes/complaintRoutes.js';
import chatbotRoutes from './routes/chatbotRoutes.js';
import reviewRoutes from './routes/reviewRoutes.js';
import authRoutes from './routes/authRoutes.js';
import verificationRoutes from './routes/verificationRoutes.js';
import addressRoutes from './routes/addressRoutes.js';
import availabilityRoutes from './routes/availabilityRoutes.js';
import testRoutes        from './routes/testRoutes.js';
import assessmentRoutes  from './routes/assessmentRoutes.js';
import dashboardRoutes   from './routes/dashboardRoutes.js';

dotenv.config();

const app = express();

if (process.env.NODE_ENV !== 'test') {
  checkSupabaseConnection();
  validateVdaServiceConfig();
  validateVdaAuthConfig();
  startReminderCron();
  startAutoCompleteCron();
}

// ── Rate limiters ─────────────────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs:       15 * 60 * 1000,   // 15 minutes
  max:            10,
  standardHeaders: true,
  legacyHeaders:  false,
  message:        { success: false, error: 'Too many login attempts. Please try again in 15 minutes.' },
});

const registerLimiter = rateLimit({
  windowMs:       2 * 60 * 1000,    // 2 minutes
  max:            5,
  standardHeaders: true,
  legacyHeaders:  false,
  message:        { success: false, message: 'Too many registration attempts. Please try again in 2 minutes.' },
});

const chatbotLimiter = rateLimit({
  windowMs:       60 * 1000,        // 1 minute
  max:            20,                // headroom under Groq's 30/min free tier
  standardHeaders: true,
  legacyHeaders:  false,
  message:        { success: false, error: 'Too many chatbot messages. Please wait a moment.' },
});

// ── Security & utility middleware ─────────────────────────────────────────
app.use(helmet());
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: ${origin} not allowed`));
  },
  credentials: true,
}));
app.use(compression());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Rate-limit auth endpoints ─────────────────────────────────────────────
app.use('/api/auth/login',    loginLimiter);
app.use('/api/auth/register', registerLimiter);   // ← A-09: new
app.use('/api/chatbot/message', chatbotLimiter);  // ← SER-AI: protect Groq quota

// ── API routes ────────────────────────────────────────────────────────────
app.use('/api/auth',         authRoutes);
app.use('/api/categories',   categoryRoutes);
app.use('/api/users',        profileRoutes);
app.use('/api/services',     serviceRoutes);
app.use('/api/providers',    providerRoutes);
app.use('/api/bookings',     bookingRoutes);
app.use('/api/dashboard',    dashboardRoutes);
app.use('/api/chatbot',      chatbotRoutes);
app.use('/api/reviews',      reviewRoutes);
app.use('/api/assessments',  assessmentRoutes);
app.use('/api/complaints',   complaintRoutes);
app.use('/api/verification', verificationRoutes);
app.use('/api/addresses',    addressRoutes);
app.use('/api/availability', availabilityRoutes);

// Test routes — development only, never exposed in production
if (process.env.NODE_ENV !== 'production') {
  app.use('/api/test', testRoutes);
}

// ── Utility endpoints ─────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({ message: 'Welcome to ServiceHub API', version: '1.0.0', status: 'running' });
});

app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// ── Global error handler ──────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  const isDev = process.env.NODE_ENV !== 'production';
  console.error('Unhandled error:', err);

  res.status(err.status || 500).json({
    success: false,
    error:   isDev ? err.message : 'Internal Server Error',
    ...(isDev && { stack: err.stack }),
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

export default app;