// server.js - Production-ready server setup
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();

// ===== SECURITY MIDDLEWARE =====
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"]
    }
  }
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-tenant-id', 'x-api-key']
}));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});

// Apply rate limiting to API routes
app.use('/api/', apiLimiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ===== ROUTE IMPORTS =====
const authRoutes = require('./routes/auth');
const schedulerRoutes = require('./routes/scheduler');
const reporterRoutes = require('./routes/reporter');
const emailRoutes = require('./routes/email');
const oauthGaRoutes = require('./routes/oauth-ga');
const aiInsightsRoutes = require('./routes/ai-insights');
const oauthMetaRoutes = require('./routes/oauth-meta');
const unifiedReporterRoutes = require('./routes/unified-reporter');
const paymentRoutes = require('./routes/payment');
const templateRoutes = require('./routes/templates');

// ===== AUTHENTICATION MIDDLEWARE =====
const authMiddleware = require('./middleware/auth');

// ===== ROUTE REGISTRATION =====

// Public routes (no auth required)
app.use('/api/auth', authRoutes);
app.use('/api/health', require('./routes/health')); // Separate health route

// Payment webhook (needs raw body)
app.use('/api/payment/webhook', 
  express.raw({ type: 'application/json' }), 
  paymentRoutes
);

// Protected routes (auth required)
app.use('/api/scheduler', authMiddleware.verifyToken, schedulerRoutes);
app.use('/api/reporter', authMiddleware.verifyToken, reporterRoutes);
app.use('/api/email', authMiddleware.verifyToken, emailRoutes);
app.use('/api/oauth/ga', authMiddleware.verifyToken, oauthGaRoutes);
app.use('/api/ai-insights', authMiddleware.verifyToken, aiInsightsRoutes);
app.use('/api/oauth/meta', authMiddleware.verifyToken, oauthMetaRoutes);
app.use('/api/unified-reporter', authMiddleware.verifyToken, unifiedReporterRoutes);
app.use('/api/payment', authMiddleware.verifyToken, paymentRoutes);
app.use('/api/templates', authMiddleware.verifyToken, templateRoutes);

// ===== ERROR HANDLING MIDDLEWARE =====
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  
  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Invalid token' });
  }
  
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Token expired' });
  }
  
  // Handle validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }
  
  // Default error
  res.status(500).json({ 
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message 
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method
  });
});

// ===== SERVER STARTUP =====
if (!process.env.NETLIFY) {
  const PORT = process.env.PORT || 3001;
  
  // Database connection test
  const supabase = require('./config/supabase');
  supabase.auth.getUser()
    .then(() => console.log('✅ Database connection verified'))
    .catch(err => console.error('❌ Database connection failed:', err.message));
  
  app.listen(PORT, () => {
    console.log(`🚀 ReportFlow Backend running on port ${PORT}`);
    console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
    console.log(`📍 API Documentation: http://localhost:${PORT}/api/docs`);
  });
}

module.exports = app;