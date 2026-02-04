// routes/health.js - Comprehensive health check
const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');

router.get('/', async (req, res) => {
  const healthCheck = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    platform: process.env.NETLIFY ? 'Netlify Functions' : 'Local Server',
    
    // System info
    node_version: process.version,
    memory_usage: process.memoryUsage(),
    
    // Database status
    database: 'checking...',
    
    // External services
    services: {
      supabase: 'checking...',
      resend: process.env.RESEND_API_KEY ? 'configured' : 'not configured',
      dodo_payments: process.env.DODO_API_KEY ? 'configured' : 'not configured',
      google_analytics: process.env.GA_CLIENT_ID ? 'configured' : 'not configured',
      meta_ads: process.env.META_APP_ID ? 'configured' : 'not configured'
    },
    
    // Features
    features: {
      ai_insights: 'ACTIVE 🧠',
      predictive_analytics: 'READY 🔮',
      anomaly_detection: 'READY ⚠️',
      competitive_benchmarking: 'READY 📊',
      meta_integration: process.env.META_APP_ID ? 'ACTIVE 📱' : 'DISABLED'
    }
  };

  try {
    // Check database connection
    const { data, error } = await supabase.from('tenants').select('count').limit(1);
    healthCheck.database = error ? 'unhealthy' : 'healthy';
    healthCheck.services.supabase = error ? 'unhealthy' : 'healthy';
    
    if (error) {
      healthCheck.status = 'degraded';
      healthCheck.database_error = error.message;
    }
  } catch (error) {
    healthCheck.database = 'unreachable';
    healthCheck.services.supabase = 'unreachable';
    healthCheck.status = 'degraded';
  }

  const statusCode = healthCheck.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(healthCheck);
});

// Detailed system status
router.get('/detailed', async (req, res) => {
  try {
    // Get database stats
    const [
      tenantsCount,
      reportsCount,
      templatesCount,
      subscriptionsCount
    ] = await Promise.all([
      supabase.from('tenants').select('count', { count: 'exact' }),
      supabase.from('generated_reports').select('count', { count: 'exact' }),
      supabase.from('tenant_templates').select('count', { count: 'exact' }),
      supabase.from('tenant_subscriptions').select('count', { count: 'exact' })
    ]);

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: {
        tenants: tenantsCount.count || 0,
        reports: reportsCount.count || 0,
        templates: templatesCount.count || 0,
        subscriptions: subscriptionsCount.count || 0
      },
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        node_version: process.version
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

module.exports = router;