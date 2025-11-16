const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Import routes
const schedulerRoutes = require('./routes/scheduler');

// Use routes
app.use('/api/scheduler', schedulerRoutes);

// Health check - works for both Netlify and local
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ReportFlow Backend Running 🚀',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    platform: process.env.NETLIFY ? 'Netlify Functions' : 'Local Server',
    baseUrl: req.baseUrl || 'None'
  });
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({
    message: 'Backend is working perfectly! 🎉',
    time: new Date().toISOString(),
    path: req.path,
    baseUrl: req.baseUrl || 'None'
  });
});

// Root endpoint for Netlify function testing
app.get('/.netlify/functions/server/api/health', (req, res) => {
  res.json({
    status: 'ReportFlow Backend Running 🚀 (Direct Function Call)',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    note: 'Accessed via direct function URL'
  });
});

// ---------------------------------------------
// EXPORT APP FOR NETLIFY FUNCTION
// ---------------------------------------------
module.exports = app;

// ---------------------------------------------
// RUN LOCAL SERVER ONLY IF NOT ON NETLIFY
// ---------------------------------------------
if (!process.env.NETLIFY) {
  const PORT = process.env.PORT || 3001;

  app.listen(PORT, () => {
    console.log(`\n🚀 ReportFlow Backend running locally on port ${PORT}`);
    console.log(`📍 Health: http://localhost:${PORT}/api/health`);
    console.log(`📍 Test: http://localhost:${PORT}/api/test`);
    console.log(`🔧 Scheduler: http://localhost:${PORT}/api/scheduler/test\n`);
  });
}