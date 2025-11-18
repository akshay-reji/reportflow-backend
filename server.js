const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Import routes
const schedulerRoutes = require('./routes/scheduler');
const reporterRoutes = require('./routes/reporter');
const emailRoutes = require('./routes/email');
const oauthGaRoutes = require('./routes/oauth-ga');

// ✅ CRITICAL FIX: Use routes
app.use('/api/scheduler', schedulerRoutes);
app.use('/api/reporter', reporterRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/oauth/ga', oauthGaRoutes);

// Health check endpoint - UPDATED FOR VERCEL
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ReportFlow Backend Running 🚀',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    platform: process.env.VERCEL ? 'Vercel Functions' : 'Local Server',
    deployment: 'reportflow-backend-8ajyo7dtv-reportflows-projects.vercel.app',
    message: 'API routing is working!',
    routes: [
      '/api/scheduler', 
      '/api/reporter', 
      '/api/email',
      '/api/oauth/ga'
    ]
  });
});

// ✅ ADD THIS: Test endpoint to verify all routes
app.get('/api/debug-routes', (req, res) => {
  res.json({
    message: 'All routes should be working',
    deployment: 'reportflow-backend-8ajyo7dtv-reportflows-projects.vercel.app',
    availableRoutes: [
      'GET /api/health',
      'POST /api/scheduler/test', 
      'POST /api/reporter/test',
      'POST /api/email/test-send',
      'GET /api/oauth/ga/test-complete',
      'GET /api/oauth/ga/auth',
      'GET /api/debug-routes'
    ]
  });
});

// ✅ ADD THIS: Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'ReportFlow Backend API',
    status: 'Running on Vercel 🚀',
    version: '1.0.0',
    deployment: 'reportflow-backend-8ajyo7dtv-reportflows-projects.vercel.app',
    endpoints: {
      health: '/api/health',
      scheduler: '/api/scheduler',
      reporter: '/api/reporter', 
      email: '/api/email',
      oauth: '/api/oauth/ga'
    }
  });
});

// ✅ ENHANCED ERROR HANDLING FOR VERCELL
app.use((err, req, res, next) => {
  console.error('🚨 Server Error:', err);
  res.status(500).json({ 
    error: 'Internal Server Error',
    deployment: 'reportflow-backend-8ajyo7dtv-reportflows-projects.vercel.app',
    // Don't expose details in production
    ...(process.env.NODE_ENV === 'development' && { details: err.message })
  });
});

// 404 handler for undefined routes
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    deployment: 'reportflow-backend-8ajyo7dtv-reportflows-projects.vercel.app',
    availableRoutes: [
      '/api/health',
      '/api/scheduler',
      '/api/reporter',
      '/api/email', 
      '/api/oauth/ga'
    ]
  });
});

// ✅ VERCELL COMPATIBLE EXPORT
if (process.env.VERCEL) {
  // Export for Vercel serverless
  console.log('🚀 Exporting for Vercel serverless environment');
  module.exports = app;
} else {
  // Local development
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 ReportFlow Backend running locally on port ${PORT}`);
    console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
    console.log(`📍 Test suite: http://localhost:${PORT}/api/oauth/ga/test-complete`);
  });
}