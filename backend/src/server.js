import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
//API Imports
import connectDB from './config/database.js';
import testRoutes from './routes/testRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import serviceRoutes from './routes/serviceRoutes.js';
import complaintRoutes from './routes/complaintRoutes.js';
import profileRoutes from './routes/profileRoutes.js';
import providerRoutes from './routes/providerRoutes.js';
import bookingRoutes from './routes/bookingRoutes.js';
import authRoutes from './routes/authRoutes.js'; // Ensure this file exists at src/routes/authRoutes.js
import userRoutes from './routes/userRoutes.js';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();

// Connect to MongoDB
if (process.env.NODE_ENV !== 'test') {
  connectDB();
}

// Rate limiting
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                   // max 10 attempts
  message: { success: false, error: 'Too many login attempts' }
});

// Middleware
app.use(helmet()); // Security headers
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true
}));
app.use(compression()); // Compress responses
app.use(morgan('dev')); // HTTP request logger
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies
app.use('/api/auth/login', loginLimiter); // Apply rate limiting to login route


app.use('/api/auth', authRoutes);
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// API Routes
app.use('/api/test', testRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/providers', providerRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/users', userRoutes);

// Basic routes
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to ServiceHub API',
    version: '1.0.0',
    status: 'running'
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`
  });
});

// Error handler
app.use((err, req, res, _next) => {
  console.error('❌ Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start server
const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`\n🚀 Server is running on port ${PORT}`);
    console.log(`📍 Environment: ${process.env.NODE_ENV}`);
    console.log(`🌐 API URL: http://localhost:${PORT}`);
    console.log(`💚 Health Check: http://localhost:${PORT}/health\n`);
  });
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Rejection:', err);
  // Close server & exit process
  process.exit(1);
});

export default app; // Export app for testing