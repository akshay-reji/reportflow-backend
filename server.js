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


// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ReportFlow Backend Running 🚀',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    platform: process.env.NETLIFY ? 'Netlify Functions' : 'Local Server',
    message: 'API routing is working!',
    routes: ['/api/scheduler', '/api/reporter', '/api/email'] // ✅ Added route confirmation
  });
});

// ✅ ADD THIS: Test endpoint to verify all routes
app.get('/api/debug-routes', (req, res) => {
  res.json({
    message: 'All routes should be working',
    availableRoutes: [
      'GET /api/health',
      'POST /api/scheduler/test', 
      'POST /api/reporter/test',
      'POST /api/email/test-send',
      'GET /api/debug-routes'
    ]
  });
});

// ✅ ADD THIS: Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'ReportFlow Backend API',
    status: 'Running',
    version: '1.0.0'
  });
});

// Export the Express app
module.exports = app;