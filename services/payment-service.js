// services/payment-service.js - DODO PAYMENT INTEGRATION
const supabase = require('../lib/supabase');

class PaymentService {
  constructor() {
    this.dodoApiUrl = process.env.DODO_API_URL || 'https://api.dodopayments.com';
    this.dodoApiKey = process.env.DODO_API_KEY;
    console.log('💰 Dodo Payment Service Initialized');
  }

  // 🎯 CREATE CUSTOMER IN DODO
  async createCustomer(tenantId, customerData) {
    try {
        const response = await fetch(`${process.env.DODO_API_URL}/v1/customers`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.DODO_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                // Map your data to Dodo's expected fields
                email: customerData.email,
                name: customerData.name,
                metadata: {
                    reportflow_tenant_id: tenantId // Crucial for linking
                }
            })
        });

      const data = await response.json();

      if (data.id) {
        // Update tenant with Dodo customer ID
        await supabase
          .from('tenants')
          .update({ dodo_customer_id: data.id })
          .eq('id', tenantId);

        return { success: true, customerId: data.id };
      } else {
        throw new Error(data.error || 'Failed to create customer');
      }
    } catch (error) {
      console.error('❌ Dodo customer creation failed:', error);
      return { success: false, error: error.message };
    }
  }

  // 🎯 CREATE SUBSCRIPTION
  async createSubscription(tenantId, planId) {
    // ... get tenant's dodo_customer_id first ...
    const subscriptionData = {
        customer_id: dodoCustomerId,
        items: [{
            price: 'price_dodo_123' // You need Dodo's Price ID for your plan
        }],
        trial_period_days: 15, // Your 15-day pilot
        metadata: {
            reportflow_tenant_id: tenantId,
            reportflow_plan_id: planId
        }
    };

    const response = await fetch(`${process.env.DODO_API_URL}/v1/subscriptions`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.DODO_API_KEY}`,
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
            current_period_end: this.calculatePeriodEnd(15), // 15-day trial
            grace_period_until: null,
            upgrade_pending: false
          }, {
            onConflict: 'tenant_id'
          });

        // Log subscription event
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
        throw new Error(data.error || 'Failed to create subscription');
      }
    } catch (error) {
      console.error('❌ Dodo subscription creation failed:', error);
      return { success: false, error: error.message };
    }
  }

  // 🎯 HANDLE WEBHOOK EVENTS
  async handleWebhook(event) {
    try {
      const { type, data } = event;

      switch (type) {
        case 'payment.succeeded':
          await this.handlePaymentSuccess(data);
          break;
        case 'payment.failed':
          await this.handlePaymentFailure(data);
          break;
        case 'subscription.canceled':
          await this.handleSubscriptionCanceled(data);
          break;
        case 'subscription.updated':
          await this.handleSubscriptionUpdated(data);
          break;
        default:
          console.log(`ℹ️ Unhandled webhook event: ${type}`);
      }

      return { success: true };
    } catch (error) {
      console.error('❌ Webhook handling failed:', error);
      return { success: false, error: error.message };
    }
  }

  // 🎯 CHECK USAGE AND ENFORCE LIMITS
  async checkUsageLimits(tenantId) {
    try {
      // Get tenant subscription
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

      // Check if in grace period
      if (subscription.grace_period_until && new Date() < new Date(subscription.grace_period_until)) {
        return { allowed: true, reason: 'Grace period active' };
      }

      // Check monthly usage
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

      // Check limits
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

  // 🔧 HELPER METHODS
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
    const { subscription_id, amount, currency } = paymentData;
    
    // Update subscription status
    await supabase
      .from('tenant_subscriptions')
      .update({
        status: 'active',
        grace_period_until: null
      })
      .eq('dodo_subscription_id', subscription_id);

    // Log upgrade history
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
    
    // Set grace period (7 days)
    const gracePeriodUntil = this.calculatePeriodEnd(7);
    
    await supabase
      .from('tenant_subscriptions')
      .update({
        grace_period_until: gracePeriodUntil
      })
      .eq('dodo_subscription_id', subscription_id);

    // Log the failure
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
    // Handle subscription updates (plan changes, etc.)
    console.log('Subscription updated:', subscriptionData);
  }
}

module.exports = new PaymentService();