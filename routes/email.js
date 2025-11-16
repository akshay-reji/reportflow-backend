const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const emailService = require('../services/email-service');
const encryptionService = require('../services/encryption-service');
const crypto = require('crypto');

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

// Get email configuration for tenant
router.get('/config', verifyWebhook, async (req, res) => {
  try {
    const { tenant_id } = req.query;
    
    if (!tenant_id) {
      return res.status(400).json({ error: 'Missing tenant_id' });
    }

    const { data: tenant, error } = await supabase
      .from('tenants')
      .select('email_provider, smtp_verified, email_sent_count, email_limit')
      .eq('id', tenant_id)
      .single();

    if (error) throw error;

    res.json({
      success: true,
      config: {
        email_provider: tenant.email_provider,
        smtp_verified: tenant.smtp_verified,
        email_sent_count: tenant.email_sent_count,
        email_limit: tenant.email_limit
      }
    });

  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Update email configuration
router.post('/config', verifyWebhook, async (req, res) => {
  try {
    const { tenant_id, email_provider, smtp_config } = req.body;
    
    if (!tenant_id) {
      return res.status(400).json({ error: 'Missing tenant_id' });
    }

    let updateData = {
      email_provider: email_provider || 'resend'
    };

    // If SMTP config provided, encrypt and store it
    if (smtp_config && email_provider === 'smtp') {
      const encryptedConfig = encryptionService.encryptSMTPConfig(smtp_config);
      updateData.smtp_config = encryptedConfig;
      updateData.smtp_verified = false; // Require verification after config change
    }

    const { data, error } = await supabase
      .from('tenants')
      .update(updateData)
      .eq('id', tenant_id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Email configuration updated successfully',
      config: {
        email_provider: data.email_provider,
        smtp_verified: data.smtp_verified
      }
    });

  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Test SMTP configuration
router.post('/test-smtp', verifyWebhook, async (req, res) => {
  try {
    const { tenant_id, smtp_config } = req.body;
    
    if (!tenant_id || !smtp_config) {
      return res.status(400).json({ error: 'Missing tenant_id or smtp_config' });
    }

    // Test the SMTP configuration
    const testResult = await emailService.testSMTP(smtp_config);

    if (testResult.success) {
      // Update tenant as verified
      const encryptedConfig = encryptionService.encryptSMTPConfig(smtp_config);
      
      await supabase
        .from('tenants')
        .update({
          smtp_config: encryptedConfig,
          smtp_verified: true,
          last_email_error: null
        })
        .eq('id', tenant_id);
    }

    res.json(testResult);

  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Test email send (for debugging)
router.post('/test-send', verifyWebhook, async (req, res) => {
  try {
    const { tenant_id, to_email } = req.body;
    
    if (!tenant_id) {
      return res.status(400).json({ error: 'Missing tenant_id' });
    }

    const { data: tenant, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenant_id)
      .single();

    if (error) throw error;

    const testEmailData = {
      client_email: to_email || tenant.contact_email,
      subject: 'ReportFlow Email System Test',
      htmlContent: `
        <h1>Email System Test</h1>
        <p>This is a test email from ReportFlow to verify your email configuration.</p>
        <p><strong>Tenant:</strong> ${tenant.company_name}</p>
        <p><strong>Provider:</strong> ${tenant.email_provider}</p>
        <p><strong>Time:</strong> ${new Date().toISOString()}</p>
      `,
      report_id: 'test-' + Date.now()
    };

    const result = await emailService.sendReport(tenant, testEmailData, null);

    res.json({
      success: true,
      message: 'Test email sent successfully',
      delivery_result: result
    });

  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;