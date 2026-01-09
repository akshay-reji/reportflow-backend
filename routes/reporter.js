const express = require('express');
const router = express.Router();
const reporterService = require('../services/reporter-service');
const supabase = require('../lib/supabase');
const crypto = require('crypto');
const { checkUsage, incrementUsage } = require('../middleware/usage-limits');


// Verify webhook secret middleware
const verifyWebhook = (req, res, next) => {
    const signature = req.headers['x-reportflow-signature'];
    
    if (!signature) {
        return res.status(401).json({ error: 'Missing signature' });
    }

    const expectedSignature = crypto
        .createHmac('sha256', process.env.WEBHOOK_SECRET)
        .update(JSON.stringify(req.body))
        .digest('hex');

    if (signature !== expectedSignature) {
        return res.status(401).json({ error: 'Invalid signature' });
    }

    next();
};

// Generate and send report (protected)
// ADD checkUsage middleware HERE, after verifyWebhook
router.post('/generate', verifyWebhook, checkUsage, async (req, res) => {
    try {
        const { report_config_id, tenant_id } = req.body;
        
        if (!report_config_id || !tenant_id) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing report_config_id or tenant_id' 
            });
        }

        console.log(`🚀 Reporter triggered for config: ${report_config_id}`);
        
        // Your existing service call
        const result = await reporterService.generateAndSendReport(report_config_id, tenant_id);
        
        // === CRITICAL: INCREMENT USAGE AFTER SUCCESS ===
        // Only increment if the report was successfully generated and sent
        if (result.success === true) {
            await incrementUsage(tenant_id, 'reports', 1);
            console.log(`📈 Incremented usage for tenant: ${tenant_id}`);
        }
        // ==============================================
        
        // Return the result from the service
        res.json(result);

    } catch (error) {
        console.error('Reporter route error:', error);
        
        // Special handling for usage limit errors thrown by checkUsage
        if (error.message?.includes('Plan limit exceeded') || error.statusCode === 429) {
            return res.status(429).json({
                success: false,
                error: error.message || 'Monthly report limit exceeded'
            });
        }
        
        res.status(500).json({ 
            success: false, 
            error: 'Failed to generate report' 
        });
    }
});

// Setup test data endpoint
router.post('/setup-test-data', async (req, res) => {
  try {
    // Get the first tenant
    const { data: tenants, error: tenantError } = await supabase
      .from('tenants')
      .select('id')
      .limit(1);

    if (tenantError || !tenants || tenants.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'No tenants found in database' 
      });
    }

    const tenantId = tenants[0].id;

    // Create a test client
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .insert({
        tenant_id: tenantId,
        client_name: 'Test Client',
        contact_email: 'test@example.com'
      })
      .select()
      .single();

    if (clientError) {
      return res.status(400).json({ 
        success: false, 
        error: `Failed to create test client: ${clientError.message}` 
      });
    }

    // Create a test report configuration
    const { data: reportConfig, error: configError } = await supabase
      .from('report_configs')
      .insert({
        tenant_id: tenantId,
        client_id: client.id,
        name: 'Test Report Configuration',
        schedule: 'weekly',
        sources: { google_analytics: { property_id: 'test' } },
        template_id: 'default',
        next_scheduled_run: new Date().toISOString(),
        is_active: true,
        schedule_frequency: 'weekly',
        schedule_time: '09:00:00',
        timezone: 'UTC'
      })
      .select()
      .single();

    if (configError) {
      return res.status(400).json({ 
        success: false, 
        error: `Failed to create test report config: ${configError.message}` 
      });
    }

    res.json({
      success: true,
      message: 'Test data created successfully',
      test_data: {
        tenant_id: tenantId,
        client_id: client.id,
        report_config_id: reportConfig.id
      }
    });

  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Test endpoint (unprotected) - Updated to use valid data
router.post('/test', async (req, res) => {
  try {
    // Get the first valid report config from the database
    const { data: reportConfigs, error } = await supabase
      .from('report_configs')
      .select('id, tenant_id')
      .limit(1);

    if (error || !reportConfigs || reportConfigs.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'No report configurations found. Run /api/reporter/setup-test-data first.' 
      });
    }

    const validConfig = reportConfigs[0];
    console.log(`🧪 Using valid report config: ${validConfig.id}, tenant: ${validConfig.tenant_id}`);
    
    const result = await reporterService.generateAndSendReport(validConfig.id, validConfig.tenant_id);
    
    res.json({
      ...result,
      note: 'This was a test run with valid database records'
    });

  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Add to routes/reporter.js - after your existing routes

// ✅ ADD THIS: GET endpoint for browser testing
router.get('/test', async (req, res) => {
  try {
    // Get the first valid report config from the database
    const { data: reportConfigs, error } = await supabase
      .from('report_configs')
      .select('id, tenant_id')
      .limit(1);

    if (error || !reportConfigs || reportConfigs.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'No report configurations found. Run /api/reporter/setup-test-data first.' 
      });
    }

    const validConfig = reportConfigs[0];
    console.log(`🧪 Using valid report config: ${validConfig.id}, tenant: ${validConfig.tenant_id}`);
    
    const result = await reporterService.generateAndSendReport(validConfig.id, validConfig.tenant_id);
    
    res.json({
      ...result,
      note: 'This was a test run with valid database records (via GET)'
    });

  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ✅ ADD THIS: Simple HTML test page
router.get('/test-page', (req, res) => {
  res.send(`
    <html>
      <body style="font-family: Arial; padding: 40px;">
        <h1>🧪 Reporter Test Page</h1>
        <p>Test the reporter service endpoints:</p>
        <ul>
          <li><a href="/api/reporter/test">GET /api/reporter/test</a> - Test report generation</li>
          <li><a href="/api/reporter/setup-test-data">GET /api/reporter/setup-test-data</a> - Create test data</li>
        </ul>
        <p>Or use curl for POST endpoints:</p>
        <pre>curl -X POST http://localhost:3001/api/reporter/test</pre>
      </body>
    </html>
  `);
});

module.exports = router;