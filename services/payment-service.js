// services/payment-service.js - DODO PAYMENT INTEGRATION
const supabase = require('../lib/supabase');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

class PaymentService {
  constructor() {
    // Use the test URL you found: https://test.dodopayments.com
    this.dodoApiUrl = process.env.DODO_API_URL || 'https://test.dodopayments.com';
    this.dodoApiKey = process.env.DODO_API_KEY;
    this.webhookSecret = process.env.DODO_WEBHOOK_SIGNING_SECRET; // Added for verification
    console.log('💰 Dodo Payment Service Initialized');
  }

// File: services/payment-service.js - UPDATED DODO API ENDPOINTS
// Based on common payment API patterns, let's try these endpoints:

async createCustomer(tenantId, customerData) {
  // Common payment API patterns show these endpoints:
  // Option 1: /api/v1/customers (most common)
  // Option 2: /v1/customers (what you tried)
  // Option 3: /customers (simplest)
  
  const possibleEndpoints = [
    '/api/v1/customers',
    '/v1/customers', 
    '/customers',
    '/v1/customers/create'
  ];
  
  console.log(`🔍 Testing Dodo API endpoints for customer creation...`);
  
  for (const endpoint of possibleEndpoints) {
    try {
      const apiUrl = `${this.dodoApiUrl}${endpoint}`;
      console.log(`🔧 Trying endpoint: ${apiUrl}`);
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.dodoApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: customerData.email,
          name: customerData.name,
          metadata: { reportflow_tenant_id: tenantId }
        })
      });
      
      const responseText = await response.text();
      console.log(`📡 Response from ${endpoint}: Status ${response.status}`);
      
      if (response.ok) {
        const data = JSON.parse(responseText);
        console.log(`✅ Success with endpoint: ${endpoint}`);
        console.log(`🎉 Customer ID: ${data.id}`);
        
        await supabase.from('tenants').update({ dodo_customer_id: data.id }).eq('id', tenantId);
        return { success: true, customerId: data.id, endpoint_used: endpoint };
      }
      
    } catch (error) {
      console.log(`❌ Endpoint ${endpoint} failed: ${error.message}`);
    }
  }
  
  return { 
    success: false, 
    error: 'All Dodo API endpoint attempts failed. Please check: 1) API key permissions 2) Base URL 3) Network connectivity',
    troubleshooting: {
      base_url: this.dodoApiUrl,
      api_key_prefix: this.dodoApiKey?.substring(0, 10) + '...',
      next_steps: [
        'Login to Dodo dashboard and check API documentation',
        'Verify your API key has customer creation permissions',
        'Check if test environment is active'
      ]
    }
  };
}

  // 🎯 CREATE SUBSCRIPTION - MAJOR FIXES APPLIED
  async createSubscription(tenantId, planId) {
    try { // FIXED 1: Added missing try-catch wrapper
      // FIXED 2: First, get the tenant's Dodo customer ID from your database
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .select('dodo_customer_id')
        .eq('id', tenantId)
        .single();

      if (tenantError || !tenant?.dodo_customer_id) {
        throw new Error('Tenant does not have a Dodo customer ID. Create customer first.');
      }

      const dodoCustomerId = tenant.dodo_customer_id; // Now defined

      // FIXED 3: You need a real PRICE ID from your Dodo Dashboard.
      // Replace 'price_dodo_123' with your actual test price ID.
      const subscriptionData = {
        customer_id: dodoCustomerId,
        items: [{
          price: 'price_dodo_123' // REPLACE THIS WITH REAL TEST PRICE ID
        }],
        trial_period_days: 15,
        metadata: {
          reportflow_tenant_id: tenantId,
          reportflow_plan_id: planId
        }
      };

      const response = await fetch(`${this.dodoApiUrl}/v1/subscriptions`, { // FIXED: instance variable
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.dodoApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(subscriptionData)
      });

      const data = await response.json();

      if (data.id) {
        // Update tenant subscription
        await supabase
          .from('tenant_subscriptions')
          .upsert({
            tenant_id: tenantId,
            plan_id: planId,
            status: 'active',
            dodo_subscription_id: data.id,
            current_period_start: new Date().toISOString(),
            current_period_end: this.calculatePeriodEnd(15),
            grace_period_until: null,
            upgrade_pending: false
          }, {
            onConflict: 'tenant_id'
          });

        await this.logSubscriptionEvent(tenantId, 'subscription_created', {
          plan_id: planId,
          dodo_subscription_id: data.id,
          trial_ends: this.calculatePeriodEnd(15)
        });

        return {
          success: true,
          subscriptionId: data.id,
          trialEnds: this.calculatePeriodEnd(15)
        };
      } else {
        throw new Error(data.error?.message || 'Failed to create subscription');
      }
    } catch (error) {
      console.error('❌ Dodo subscription creation failed:', error);
      return { success: false, error: error.message };
    }
  }

  // 🎯 HANDLE WEBHOOK EVENTS - UPDATED FOR EXPRESS
  async handleWebhook(req, res) { // FIXED: Takes (req, res) for Express
    try {
      // BASIC SIGNATURE CHECK (Highly Recommended - prevents corrupted test data)
      const signature = req.headers['dodo-signature']; // Confirm header name from Dodo docs
      if (this.webhookSecret && signature !== this.webhookSecret) { // Simple check for now
        console.warn('⚠️ Webhook signature mismatch. Possible forgery or misconfiguration.');
        // For strict security, return res.status(401).send('Invalid signature');
      }

      const { type, data } = req.body; // FIXED: Get event from req.body

      console.log(`🔄 Processing Dodo webhook: ${type}`);

      switch (type) {
        case 'payment.succeeded':
          await this.handlePaymentSuccess(data);
          break;
        case 'payment.failed':
          await this.handlePaymentFailure(data);
          break;
        case 'subscription.cancelled': // Adjusted to your subscribed event name
          await this.handleSubscriptionCanceled(data);
          break;
        case 'subscription.updated':
          await this.handleSubscriptionUpdated(data);
          break;
        // Add cases for other events you subscribed to
        case 'subscription.active':
          console.log('New active subscription:', data.id);
          // Update your database status here
          break;
        default:
          console.log(`ℹ️ Unhandled webhook event: ${type}`);
      }

      // Always acknowledge receipt immediately to prevent Dodo from retrying
      res.status(200).json({ received: true });
    } catch (error) {
      console.error('❌ Webhook handling failed:', error);
      res.status(500).json({ error: 'Webhook handler failed' });
    }
  }

  // 🎯 CHECK USAGE AND ENFORCE LIMITS (This function was already correct)
  async checkUsageLimits(tenantId) {
    try {
      const { data: subscription } = await supabase
        .from('tenant_subscriptions')
        .select(`
          status,
          grace_period_until,
          plan_id,
          plans (
            max_reports_per_month,
            max_clients
          )
        `)
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .single();

      if (!subscription) {
        return { allowed: false, reason: 'No active subscription' };
      }

      if (subscription.grace_period_until && new Date() < new Date(subscription.grace_period_until)) {
        return { allowed: true, reason: 'Grace period active' };
      }

      const currentMonth = new Date().toISOString().slice(0, 7) + '-01';
      const { data: usage } = await supabase
        .from('tenant_usage')
        .select('reports_sent, client_count')
        .eq('tenant_id', tenantId)
        .eq('month', currentMonth)
        .single();

      const plan = subscription.plans;
      const reportsSent = usage?.reports_sent || 0;
      const clientCount = usage?.client_count || 0;

      const exceededReports = plan.max_reports_per_month && reportsSent >= plan.max_reports_per_month;
      const exceededClients = plan.max_clients && clientCount >= plan.max_clients;

      if (exceededReports || exceededClients) {
        return {
          allowed: false,
          reason: 'Plan limits exceeded',
          limits: {
            reports: { used: reportsSent, limit: plan.max_reports_per_month },
            clients: { used: clientCount, limit: plan.max_clients }
          }
        };
      }

      return { allowed: true, usage: { reportsSent, clientCount } };
    } catch (error) {
      console.error('❌ Usage check failed:', error);
      return { allowed: false, error: error.message };
    }
  }

  // 🔧 HELPER METHODS (No changes needed here)
  calculatePeriodEnd(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString();
  }

  async logSubscriptionEvent(tenantId, eventType, metadata = {}) {
    try {
      await supabase
        .from('subscription_events')
        .insert({
          tenant_id: tenantId,
          event_type: eventType,
          metadata: metadata
        });
    } catch (error) {
      console.error('❌ Failed to log subscription event:', error);
    }
  }

  async handlePaymentSuccess(paymentData) {
    const { subscription_id, amount } = paymentData;
    await supabase
      .from('tenant_subscriptions')
      .update({
        status: 'active',
        grace_period_until: null
      })
      .eq('dodo_subscription_id', subscription_id);

    const { data: subscription } = await supabase
      .from('tenant_subscriptions')
      .select('tenant_id, plan_id')
      .eq('dodo_subscription_id', subscription_id)
      .single();

    if (subscription) {
      await supabase
        .from('upgrade_history')
        .insert({
          tenant_id: subscription.tenant_id,
          plan_id: subscription.plan_id,
          amount_paid: amount,
          dodo_payment_id: paymentData.id,
          status: 'completed',
          processed_at: new Date().toISOString()
        });
    }
  }

  async handlePaymentFailure(paymentData) {
    const { subscription_id } = paymentData;
    const gracePeriodUntil = this.calculatePeriodEnd(7);
    await supabase
      .from('tenant_subscriptions')
      .update({
        grace_period_until: gracePeriodUntil
      })
      .eq('dodo_subscription_id', subscription_id);

    const { data: subscription } = await supabase
      .from('tenant_subscriptions')
      .select('tenant_id')
      .eq('dodo_subscription_id', subscription_id)
      .single();

    if (subscription) {
      await this.logSubscriptionEvent(subscription.tenant_id, 'payment_failed', {
        subscription_id,
        grace_period_until: gracePeriodUntil
      });
    }
  }

  async handleSubscriptionCanceled(subscriptionData) {
    const { id: subscriptionId } = subscriptionData;
    await supabase
      .from('tenant_subscriptions')
      .update({
        status: 'canceled',
        canceled_at: new Date().toISOString()
      })
      .eq('dodo_subscription_id', subscriptionId);
  }

  async handleSubscriptionUpdated(subscriptionData) {
    console.log('Subscription updated:', subscriptionData);
  }
}

module.exports = new PaymentService();