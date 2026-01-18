const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// In server.js - Update the payment routes mounting section:

// ... existing imports ...

const schedulerRoutes = require('./routes/scheduler');
const reporterRoutes = require('./routes/reporter');
const emailRoutes = require('./routes/email');
const oauthGaRoutes = require('./routes/oauth-ga');
const aiInsightsRoutes = require('./routes/ai-insights');
const oauthMetaRoutes = require('./routes/oauth-meta');
const unifiedReporterRoutes = require('./routes/unified-reporter');
const paymentRoutes = require('./routes/payment');
const usageTracking = require('./middleware/usage-limits');
const templateRoutes = require('./routes/templates');

// ... existing middleware ...

// Import routes
app.use('/api/scheduler', schedulerRoutes);
app.use('/api/reporter', reporterRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/oauth/ga', oauthGaRoutes);
app.use('/api/ai-insights', aiInsightsRoutes);
app.use('/api/oauth/meta', oauthMetaRoutes);
app.use('/api/unified-reporter', unifiedReporterRoutes);

// 🚨 CRITICAL FIX: Mount payment webhook with raw body parsing
// Webhook needs raw body for signature verification
app.use('/api/payment/webhook', express.raw({ type: 'application/json' }), paymentRoutes);
// Other payment routes use JSON parsing
app.use('/api/payment', paymentRoutes);

// ✅ FIX: Enable usage tracking middleware on reporter endpoints
app.use('/api/reporter/generate', usageTracking.checkUsage.bind(usageTracking));
app.use('/api/reporter/generate', usageTracking.incrementUsage.bind(usageTracking));
app.use('/api/templates', authenticateToken, templateRoutes); // Add your auth middleware

// ... rest of the server.js remains the same ...


// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ReportFlow Backend Running 🚀',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    platform: process.env.NETLIFY ? 'Netlify Functions' : 'Local Server',
    message: 'API routing is working!',
    routes: [
      '/api/scheduler', 
      '/api/reporter', 
      '/api/email', 
      '/api/oauth/ga',
      '/api/oauth/meta', // 🆕 META OAUTH ROUTES
      '/api/ai-insights'
    ],
    revolutionary_features: {
      ai_insights: 'ACTIVE 🧠',
      predictive_analytics: 'READY 🔮', 
      anomaly_detection: 'READY ⚠️',
      competitive_benchmarking: 'READY 📊',
      meta_integration: 'ACTIVE 📱' // 🆕 META STATUS
    },
    oauth_providers: {
      google_analytics: '✅ CONFIGURED',
      meta_ads: process.env.META_APP_ID ? '✅ CONFIGURED' : '❌ NEEDS SETUP'
    }
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
      'GET /api/oauth/ga/test-complete',
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

app.post('/api/usage/webhook', async (req, res) => {
  try {
    const { tenant_id, action, metadata } = req.body;
    
    // Log usage event
    const supabase = require('./lib/supabase');
    
    await supabase
      .from('usage_events')
      .insert({
        tenant_id,
        action,
        metadata,
        created_at: new Date().toISOString()
      });

    res.json({ success: true, message: 'Usage logged' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ CRITICAL FIX: Add local server startup
if (!process.env.NETLIFY) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`🚀 ReportFlow Backend running locally on port ${PORT}`);
    console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
    console.log(`📍 OAuth Test: http://localhost:${PORT}/api/oauth/ga/test-complete`);
    console.log(`📍 Debug Routes: http://localhost:${PORT}/api/debug-routes`);
  });
}
// Export the Express app for Netlify
module.exports = app;