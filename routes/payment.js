// routes/payment.js - ENHANCED VERSION
const express = require('express');
const router = express.Router();
const paymentService = require('../services/payment-service');
const crypto = require('crypto');
const supabase = require('../lib/supabase');

// Middleware to extract tenant ID and validate
const validateTenant = (req, res, next) => {
  const tenantId = req.body.tenant_id || req.headers['x-tenant-id'];
  
  if (!tenantId) {
    return res.status(400).json({ 
      success: false, 
      error: 'tenant_id is required. Provide in body or x-tenant-id header.' 
    });
  }
  
  
  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(tenantId)) {
    return res.status(400).json({ 
      success: false, 
      error: 'tenant_id must be a valid UUID' 
    });
  }
  
  req.tenantId = tenantId;
  next();
};

// Create customer - internal endpoint that calls Dodo
router.post('/create-customer', validateTenant, async (req, res) => {
  try {
    const { customer } = req.body;
    
    if (!customer || !customer.email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Customer object with email is required' 
      });
    }

    console.log(`💳 Creating customer for tenant: ${req.tenantId}`);
    
    const result = await paymentService.createCustomer(req.tenantId, customer);
    
   if (result.success) {
    res.status(201).json(result); // ✅ Tests expect 201 on success
} else {
    // Map the service error status to HTTP status
    const statusCode = result.status === 400 ? 400 : 
                      result.status === 401 ? 401 : 
                      result.status === 404 ? 404 : 422; // Default to 422
    res.status(statusCode).json(result);
}
  } catch (err) {
    console.error('❌ create-customer error:', err.message);
    
    // Provide more detailed error information
    let statusCode = 500;
    let errorMessage = err.message;
    
    if (err.message.includes('required') || err.message.includes('Missing')) {
      statusCode = 400;
    } else if (err.message.includes('Dodo')) {
      statusCode = 502; // Bad Gateway - Dodo API error
    }
    
    res.status(statusCode).json({ 
      success: false, 
      error: errorMessage,
      tenantId: req.tenantId,
      timestamp: new Date().toISOString()
    });
  }
});

// Create subscription
router.post('/create-subscription', validateTenant, async (req, res) => {
  try {
    const { price_id, plan_id, dodo_customer_id, trial_days } = req.body;
    
    if (!price_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'price_id is required' 
      });
    }

    console.log(`💳 Creating subscription for tenant: ${req.tenantId}, price: ${price_id}`);
    
    const result = await paymentService.createSubscription(
      req.tenantId, 
      price_id, 
      dodo_customer_id,
      {
        plan_id: plan_id || 'starter',
        trial_period_days: trial_days || 15
      }
    );
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    if (result.success) {
    res.status(201).json(result); // ✅ Tests expect 201 on success
} else {
    // Map the service error status to HTTP status
    const statusCode = result.status === 400 ? 400 : 
                      result.status === 401 ? 401 : 
                      result.status === 404 ? 404 : 422; // Default to 422
    res.status(statusCode).json(result);
}
  } catch (err) {
    console.error('❌ create-subscription error:', err.message);
    
    let statusCode = 500;
    if (err.message.includes('required') || err.message.includes('not have')) {
      statusCode = 400;
    }
    
    res.status(statusCode).json({ 
      success: false, 
      error: err.message,
      tenantId: req.tenantId 
    });
  }
});

// Cancel subscription
router.post('/cancel-subscription', validateTenant, async (req, res) => {
  try {
    const { subscription_id } = req.body;
    
    if (!subscription_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'subscription_id is required' 
      });
    }

    // In a real implementation, you would call Dodo API to cancel
    // For now, we'll update the status in our database
    
    const { error } = await supabase
      .from('tenant_subscriptions')
      .update({ 
        status: 'canceled',
        canceled_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('tenant_id', req.tenantId)
      .eq('dodo_subscription_id', subscription_id);

    if (error) {
      throw new Error(`Failed to cancel subscription: ${error.message}`);
    }

    // Log the cancellation event
    await supabase.from('subscription_events').insert({
      tenant_id: req.tenantId,
      event_type: 'subscription_canceled',
      metadata: { subscription_id, canceled_at: new Date().toISOString() },
      created_at: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Subscription canceled successfully',
      subscription_id,
      canceled_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('❌ cancel-subscription error:', err.message);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// Get subscription status
router.get('/status', validateTenant, async (req, res) => {
  try {
    const { data: subscription, error } = await supabase
      .from('tenant_subscriptions')
      .select(`
        *,
        plans (
          name,
          max_reports_per_month,
          max_clients
        )
      `)
      .eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !subscription) {
      return res.json({
        success: true,
        has_subscription: false,
        status: 'no_subscription'
      });
    }

    // Get current usage
    const currentMonth = new Date().toISOString().slice(0, 7) + '-01';
    const { data: usage } = await supabase
      .from('tenant_usage')
      .select('reports_sent, client_count')
      .eq('tenant_id', req.tenantId)
      .eq('month', currentMonth)
      .single();

    res.json({
      success: true,
      has_subscription: true,
      subscription: {
        ...subscription,
        current_usage: usage || { reports_sent: 0, client_count: 0 }
      }
    });
  } catch (err) {
    console.error('❌ subscription status error:', err.message);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// Webhook receiver - IMPORTANT: This must be mounted with express.raw() middleware
// In server.js: app.use('/api/payment/webhook', express.raw({ type: 'application/json' }), paymentRoutes);
router.post('/webhook', async (req, res) => {
  try {
    // Note: req.body is a Buffer because of express.raw() middleware
    const rawBody = req.body;
    const headers = req.headers;
    
    if (!rawBody || rawBody.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Empty webhook body' 
      });
    }

    console.log('🔄 Received webhook:', {
      contentType: headers['content-type'],
      signature: headers['x-dodo-signature'] || headers['dodo-signature'],
      bodyLength: rawBody.length
    });

    // Process the webhook
    const result = await paymentService.handleWebhook(
      rawBody, 
      headers, 
      process.env.DODO_WEBHOOK_SIGNING_SECRET
    );

    if (result.processed) {
      res.json({ 
        success: true, 
        message: 'Webhook processed successfully',
        eventId: result.eventId,
        eventType: result.eventType
      });
    } else {
      res.json({ 
        success: true, 
        message: 'Webhook skipped (duplicate)',
        eventId: result.eventId
      });
    }
  } catch (err) {
    console.error('❌ Webhook handler error:', err.message);
    
    // Still return 200 to Dodo to prevent retries for bad signatures
    // But log the error internally
    res.status(200).json({ 
      success: false, 
      error: err.message,
      note: 'Error logged internally, but webhook acknowledged to prevent retries'
    });
  }
});

// Get invoices
router.get('/invoices', validateTenant, async (req, res) => {
  try {
    // In a real implementation, fetch from Dodo API
    // For now, return mock/stored invoices
    
    const { data: subscription } = await supabase
      .from('tenant_subscriptions')
      .select('dodo_subscription_id')
      .eq('tenant_id', req.tenantId)
      .single();

    if (!subscription?.dodo_subscription_id) {
      return res.json({
        success: true,
        invoices: [],
        message: 'No subscription found'
      });
    }

    // Mock response - integrate with Dodo API when available
    res.json({
      success: true,
      invoices: [
        {
          id: 'inv_mock_1',
          amount: 4999,
          currency: 'usd',
          status: 'paid',
          created: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          invoice_pdf: null
        }
      ],
      subscription_id: subscription.dodo_subscription_id
    });
  } catch (err) {
    console.error('❌ invoices error:', err.message);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// Test endpoint
router.post('/test-webhook', async (req, res) => {
  try {
    // This endpoint simulates a webhook for testing
    // SECURITY: In production, this should be protected or removed
    
    const { event_type, tenant_id, subscription_id } = req.body;
    
    if (!event_type) {
      return res.status(400).json({ 
        success: false, 
        error: 'event_type is required' 
      });
    }

    // Create a mock webhook payload
    const mockWebhook = {
      id: `evt_test_${Date.now()}`,
      type: event_type,
      data: {
        object: {
          id: subscription_id || `sub_test_${Date.now()}`,
          status: event_type.includes('succeeded') ? 'active' : 'past_due'
        }
      },
      metadata: {
        reportflow_tenant_id: tenant_id
      }
    };

    const rawBody = Buffer.from(JSON.stringify(mockWebhook));
    const headers = {
      'x-dodo-signature': 'test_signature_development_only'
    };

    const result = await paymentService.handleWebhook(
      rawBody, 
      headers, 
      null // No signature verification for test
    );

    res.json({
      success: true,
      message: 'Test webhook processed',
      mock_webhook: mockWebhook,
      processing_result: result
    });
  } catch (err) {
    console.error('❌ test-webhook error:', err.message);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

module.exports = router;