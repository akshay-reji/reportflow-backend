// services/payment-service.js - ENHANCED VERSION
const axios = require('axios');
const axiosRetry = require('axios-retry').default;  // ← Access .default

const DODO_BASE = (process.env.DODO_API_URL || 'https://test.dodopayments.com').replace(/\/+$/, '');
const API_KEY = process.env.DODO_API_KEY;
const WEBHOOK_SECRET = process.env.DODO_WEBHOOK_SIGNING_SECRET || null;
const DEFAULT_TIMEOUT_MS = 10000;

// Create axios instance with retry configuration
const createAxiosInstance = () => {

  const instance = axios.create({
    timeout: DEFAULT_TIMEOUT_MS,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`
    }
  });

  axiosRetry(instance, {
    retries: 3,
    retryDelay: axiosRetry.exponentialDelay, // Uses formula: 1000 * 2^attempt
    retryCondition: (error) => {
      // Retry on network errors, timeouts, or 5xx server errors
      return axiosRetry.isNetworkOrIdempotentRequestError(error) || 
             (error.response && error.response.status >= 500);
    },
    onRetry: (retryCount, error, requestConfig) => {
      console.log(`💰 Dodo API retry ${retryCount} for ${requestConfig.url}: ${error.message}`);
    }
  });

  // Add response interceptor for better error logging
  instance.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response) {
        console.error('💰 Dodo API Error:', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data,
          url: error.config?.url
        });
      } else if (error.request) {
        console.error('💰 Dodo Network Error:', {
          message: error.message,
          code: error.code,
          url: error.config?.url
        });
      } else {
        console.error('💰 Dodo Request Setup Error:', error.message);
      }
      return Promise.reject(error);
    }
  );

  return instance;
};

class PaymentService {
  constructor() {
    this.axiosInstance = createAxiosInstance();
    console.log('💰 PaymentService initialized with enhanced error handling');
  }

  // Helper: try a list of candidate endpoints with exponential backoff
  async tryEndpoints(method = 'POST', body = null, candidatePaths = [], maxRetries = 3) {
    const axiosInstance = this.axiosInstance;
    
    for (const path of candidatePaths) {
      const url = `${DODO_BASE}${path}`;
      let lastError = null;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`💳 PaymentService: Attempt ${attempt}/${maxRetries} for ${method} ${url}`);
          
          const config = {
            method,
            url,
            data: body || undefined
          };
          
          const response = await axiosInstance(config);
          
          if (response.status >= 200 && response.status < 300) {
            console.log(`✅ PaymentService: ${method} ${url} succeeded (status ${response.status})`);
            return { 
              ok: true, 
              data: response.data, 
              endpointUsed: url,
              status: response.status 
            };
          } else {
            console.warn(`⚠️ PaymentService: ${method} ${url} -> status ${response.status}`, response.data);
            lastError = { 
              status: response.status, 
              data: response.data, 
              url,
              attempt 
            };
            // Don't retry 4xx errors (client errors)
            if (response.status >= 400 && response.status < 500) {
              break;
            }
          }
        } catch (err) {
          lastError = {
            error: err.message,
            url,
            attempt,
            config: err.config?.url,
            code: err.code
          };
          console.error(`❌ PaymentService attempt ${attempt} failed for ${url}:`, err.message);
          
          // Exponential backoff
          if (attempt < maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
            console.log(`⏳ Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      
      // If we exhausted retries for this endpoint, continue to next candidate
      console.log(`↪️ PaymentService: Trying next endpoint, current failed: ${url}`);
    }
    
    return { 
      ok: false, 
      error: lastError || 'All endpoints and retries failed',
      candidatePathsTried: candidatePaths 
    };
  }

  // Create customer (tenantId required)
  async createCustomer(tenantId, customerPayload = {}) {
    // Validate required fields
    if (!tenantId) {
      throw new Error('tenantId is required to create customer');
    }
    
    if (!customerPayload.email) {
      throw new Error('Customer email is required');
    }

    const candidatePaths = [
      '/v1/customers',
      '/api/v1/customers', 
      '/customers',
      '/api/customers'
    ];

    // Normalize payload to Dodo expected format
    const body = {
      email: customerPayload.email,
      name: customerPayload.name || customerPayload.full_name || null,
      phone: customerPayload.phone || null,
      metadata: {
        ...(customerPayload.metadata || {}),
        reportflow_tenant_id: tenantId,
        source: 'reportflow_saas'
      }
    };

    console.log('💳 Creating Dodo customer for tenant:', tenantId);
    const result = await this.tryEndpoints('POST', body, candidatePaths);

    if (!result.ok) {
      throw new Error(`Dodo createCustomer failed: ${JSON.stringify(result.error, null, 2)}`);
    }

    const dodoCustomer = result.data;

    // Try to extract customer ID in multiple possible shapes
    const customerId = dodoCustomer?.id || 
                      dodoCustomer?.customer_id || 
                      dodoCustomer?.data?.id || 
                      dodoCustomer?.data?.customer_id || 
                      null;

    if (!customerId) {
      console.warn('⚠️ Could not extract customer ID from Dodo response:', dodoCustomer);
      throw new Error('Dodo response did not contain a customer ID');
    }

    // Persist mapping tenant -> dodo customer id
    try {
      const { error: updateError } = await supabase
        .from('tenants')
        .update({ 
          dodo_customer_id: customerId,
          updated_at: new Date().toISOString()
        })
        .eq('id', tenantId);

      if (updateError) {
        console.warn('⚠️ Failed to persist dodo_customer_id to database:', updateError.message);
        // Continue anyway - the API call succeeded
      } else {
        console.log('✅ PaymentService: saved dodo_customer_id to tenants table');
      }
    } catch (dbErr) {
      console.warn('⚠️ Database error while saving dodo_customer_id:', dbErr.message);
    }

    return { 
      success: true, 
      customer: dodoCustomer, 
      endpointUsed: result.endpointUsed, 
      customerId,
      tenantId 
    };
  }

  // Create subscription (requires tenantId + either dodoCustomerId or existing mapping)
  async createSubscription(tenantId, priceId = null, dodoCustomerId = null, extraPayload = {}) {
    try {
      // Validate priceId
      if (!priceId) {
        throw new Error('priceId is required to create subscription (use a Dodo test price id).');
      }

      // If dodoCustomerId not provided, try to fetch from tenants table
      if (!dodoCustomerId) {
        const { data: tenant, error: tenantError } = await supabase
          .from('tenants')
          .select('dodo_customer_id')
          .eq('id', tenantId)
          .single();

        if (tenantError) {
          throw new Error(`Failed to fetch tenant: ${tenantError.message}`);
        }
        
        if (!tenant?.dodo_customer_id) {
          throw new Error('Tenant does not have a Dodo customer id. Create customer first or pass dodoCustomerId.');
        }
        dodoCustomerId = tenant.dodo_customer_id;
      }

      // Build subscription body
      const body = {
        customer: dodoCustomerId,
        items: [{ price: priceId }],
        trial_period_days: extraPayload.trial_period_days || 15,
        metadata: {
          ...(extraPayload.metadata || {}),
          reportflow_tenant_id: tenantId,
          plan_id: extraPayload.plan_id || 'starter'
        },
        payment_behavior: 'default_incomplete',
        expand: ['latest_invoice.payment_intent']
      };

      const candidatePaths = [
        '/v1/subscriptions',
        '/api/v1/subscriptions', 
        '/subscriptions',
        '/api/subscriptions'
      ];

      console.log('💳 Creating Dodo subscription for tenant:', tenantId);
      const result = await this.tryEndpoints('POST', body, candidatePaths);

      if (!result.ok) {
        throw new Error(`Dodo createSubscription failed: ${JSON.stringify(result.error, null, 2)}`);
      }

      const subscription = result.data;
      const subscriptionId = subscription?.id || 
                            subscription?.subscription_id || 
                            subscription?.data?.id || 
                            null;

      if (!subscriptionId) {
        throw new Error('Dodo response did not contain a subscription ID');
      }

      // Persist created subscription to tenant_subscriptions
      try {
        const subscriptionData = {
          tenant_id: tenantId,
          plan_id: extraPayload.plan_id || priceId, // Use plan_id if provided, otherwise priceId
          status: subscription.status || 'incomplete',
          dodo_subscription_id: subscriptionId,
          current_period_start: subscription.current_period_start || new Date().toISOString(),
          current_period_end: subscription.current_period_end || this.calculatePeriodEnd(body.trial_period_days || 15),
          grace_period_until: null,
          upgrade_pending: false,
          created_at: new Date().toISOString()
        };

        // Upsert into tenant_subscriptions
        const { error: upsertError } = await supabase
          .from('tenant_subscriptions')
          .upsert(subscriptionData, { 
            onConflict: 'tenant_id',
            ignoreDuplicates: false 
          });

        if (upsertError) {
          console.warn('⚠️ Failed to persist subscription to database:', upsertError.message);
        } else {
          console.log('✅ Subscription stored in tenant_subscriptions');
        }

        // Log subscription event
        await this.logSubscriptionEvent(tenantId, 'subscription_created', {
          plan_id: extraPayload.plan_id || priceId,
          dodo_subscription_id: subscriptionId,
          trial_ends: this.calculatePeriodEnd(body.trial_period_days || 15),
          raw_response: subscription
        });

      } catch (dbErr) {
        console.warn('⚠️ Database error while saving subscription:', dbErr.message);
        // Don't throw - the subscription was created at Dodo
      }

      return { 
        success: true, 
        subscription, 
        endpointUsed: result.endpointUsed, 
        subscriptionId,
        tenantId 
      };
    } catch (err) {
      console.error('❌ PaymentService.createSubscription error:', err.message);
      return { 
        success: false, 
        error: err.message,
        tenantId 
      };
    }
  }

  // Enhanced webhook handler
  async handleWebhook(rawBody, headers, webhookSecret = WEBHOOK_SECRET) {
    try {
      // Verify signature if secret is configured
      if (webhookSecret) {
        const signatureHeader = headers['dodo-signature'] || 
                               headers['dodo_signature'] || 
                               headers['x-dodo-signature'] ||
                               headers['x-signature'];
        
        if (!signatureHeader) {
          throw new Error('Missing webhook signature header');
        }

        const isValid = this.verifyDodoSignature(rawBody, signatureHeader, webhookSecret);
        if (!isValid) {
          throw new Error('Invalid webhook signature');
        }
      } else {
        console.warn('⚠️ Webhook signature verification disabled - DODO_WEBHOOK_SIGNING_SECRET not set');
      }

      // Parse the webhook payload
      const payload = JSON.parse(rawBody.toString('utf8'));
      const eventId = payload.id || payload.event_id || payload.data?.id || `webhook_${Date.now()}`;
      const eventType = payload.type || payload.event || 'unknown';
      
      // Extract tenant ID from metadata
      const tenantId = payload.metadata?.reportflow_tenant_id || 
                      payload.data?.metadata?.reportflow_tenant_id ||
                      null;

      console.log(`🔄 Processing webhook: ${eventType} (eventId: ${eventId}) for tenant: ${tenantId || 'unknown'}`);

      // Check for duplicate event (idempotency)
      const { data: existingEvent } = await supabase
        .from('subscription_events')
        .select('id')
        .eq('event_id', eventId)
        .limit(1);

      if (existingEvent && existingEvent.length > 0) {
        console.log(`⏭️ Skipping duplicate webhook event: ${eventId}`);
        return { 
          processed: false, 
          reason: 'duplicate',
          eventId,
          eventType 
        };
      }

      // Store the webhook event
      const { error: insertError } = await supabase
        .from('subscription_events')
        .insert({
          tenant_id: tenantId,
          event_type: eventType,
          event_id: eventId,
          metadata: payload,
          created_at: new Date().toISOString()
        });

      if (insertError) {
        console.error('❌ Failed to store webhook event:', insertError.message);
        throw new Error(`Failed to store webhook event: ${insertError.message}`);
      }

      // Process the event based on type
      await this.processWebhookEvent(eventType, payload, tenantId);

      return { 
        processed: true, 
        eventId,
        eventType,
        tenantId 
      };

    } catch (err) {
      console.error('❌ Webhook handling error:', err.message);
      throw err;
    }
  }

  // Process different webhook event types
  async processWebhookEvent(eventType, payload, tenantId) {
    console.log(`🔄 Processing event: ${eventType} for tenant: ${tenantId}`);

    const subscriptionId = payload.data?.object?.id || 
                         payload.data?.subscription_id ||
                         payload.subscription;

    try {
      switch (eventType) {
        case 'payment.succeeded':
        case 'invoice.paid':
          await this.handlePaymentSuccess(subscriptionId, payload);
          break;

        case 'payment.failed':
        case 'invoice.payment_failed':
          await this.handlePaymentFailure(subscriptionId, payload);
          break;

        case 'subscription.cancelled':
        case 'customer.subscription.deleted':
          await this.handleSubscriptionCanceled(subscriptionId, payload);
          break;

        case 'subscription.updated':
        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdated(subscriptionId, payload);
          break;

        case 'subscription.created':
          await this.handleSubscriptionCreated(subscriptionId, payload);
          break;

        default:
          console.log(`ℹ️ Unhandled webhook type: ${eventType}`);
      }
    } catch (err) {
      console.error(`❌ Error processing ${eventType}:`, err.message);
      // Don't throw - we want to acknowledge the webhook even if processing fails
    }
  }

  // Helper: Verify Dodo webhook signature
  verifyDodoSignature(rawBody, signatureHeader, secret) {
    const crypto = require('crypto');
    
    // Remove prefix if present (e.g., "sha256=")
    const receivedSignature = signatureHeader.replace(/^sha256=/, '');
    
    // Compute expected signature
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');
    
    // Use timingSafeEqual to prevent timing attacks
    const receivedBuffer = Buffer.from(receivedSignature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    
    // If lengths don't match, verification fails
    if (receivedBuffer.length !== expectedBuffer.length) {
      return false;
    }
    
    return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
  }

  // Usage check with improved error handling
  async checkUsageLimits(tenantId, usageType = 'reports') {
    try {
      const { data: subscription, error: subError } = await supabase
        .from('tenant_subscriptions')
        .select(`
          status,
          grace_period_until,
          plan_id,
          plans (
            max_reports_per_month,
            max_clients,
            max_data_sources
          )
        `)
        .eq('tenant_id', tenantId)
        .single();

      if (subError || !subscription) {
        return { 
          allowed: false, 
          reason: 'No active subscription found',
          error: subError?.message 
        };
      }

      // Check subscription status
      if (subscription.status !== 'active') {
        // Check if in grace period
        if (subscription.grace_period_until && new Date() < new Date(subscription.grace_period_until)) {
          return { 
            allowed: true, 
            reason: 'In grace period',
            grace_period_until: subscription.grace_period_until 
          };
        }
        return { 
          allowed: false, 
          reason: `Subscription is ${subscription.status}` 
        };
      }

      // Get current month usage
      const currentMonth = new Date().toISOString().slice(0, 7) + '-01';
      const { data: usage, error: usageError } = await supabase
        .from('tenant_usage')
        .select('reports_sent, client_count, data_sources_connected')
        .eq('tenant_id', tenantId)
        .eq('month', currentMonth)
        .single();

      const currentUsage = usage || { 
        reports_sent: 0, 
        client_count: 0, 
        data_sources_connected: 0 
      };

      const plan = subscription.plans || {};
      let limitExceeded = false;
      let limitType = '';

      // Check specific limits
      switch (usageType) {
        case 'reports':
          if (plan.max_reports_per_month && currentUsage.reports_sent >= plan.max_reports_per_month) {
            limitExceeded = true;
            limitType = 'reports';
          }
          break;

        case 'clients':
          if (plan.max_clients && currentUsage.client_count >= plan.max_clients) {
            limitExceeded = true;
            limitType = 'clients';
          }
          break;

        case 'data_sources':
          if (plan.max_data_sources && currentUsage.data_sources_connected >= plan.max_data_sources) {
            limitExceeded = true;
            limitType = 'data_sources';
          }
          break;

        default:
          // Check all limits for general access
          if (plan.max_reports_per_month && currentUsage.reports_sent >= plan.max_reports_per_month) {
            limitExceeded = true;
            limitType = 'reports';
          }
      }

      if (limitExceeded) {
        return {
          allowed: false,
          reason: 'Plan limit exceeded',
          limitType,
          usage: currentUsage,
          limits: {
            reports: plan.max_reports_per_month,
            clients: plan.max_clients,
            data_sources: plan.max_data_sources
          },
          upgrade_url: '/api/payment/upgrade'
        };
      }

      return { 
        allowed: true, 
        usage: currentUsage,
        limits: {
          reports: plan.max_reports_per_month,
          clients: plan.max_clients,
          data_sources: plan.max_data_sources
        }
      };

    } catch (error) {
      console.error('❌ PaymentService.checkUsageLimits failed:', error);
      // Fail open in case of errors to not block legitimate requests
      return { 
        allowed: true, 
        error: error.message,
        reason: 'Error checking usage, allowing request'
      };
    }
  }

  // Helper methods
  calculatePeriodEnd(days) {
    const date = new Date();
    date.setDate(date.getDate() + (days || 0));
    return date.toISOString();
  }

  async logSubscriptionEvent(tenantId, eventType, metadata = {}) {
    try {
      const { error } = await supabase
        .from('subscription_events')
        .insert({
          tenant_id: tenantId,
          event_type: eventType,
          metadata,
          created_at: new Date().toISOString()
        });

      if (error) {
        console.warn('⚠️ Failed to log subscription event:', error.message);
      }
    } catch (err) {
      console.warn('⚠️ Error logging subscription event:', err.message);
    }
  }

  // Event handlers
  async handlePaymentSuccess(subscriptionId, paymentData) {
    try {
      if (subscriptionId) {
        await supabase
          .from('tenant_subscriptions')
          .update({ 
            status: 'active', 
            grace_period_until: null,
            updated_at: new Date().toISOString()
          })
          .eq('dodo_subscription_id', subscriptionId);
      }

      // Log payment in upgrade_history if applicable
      const { data: subscription } = await supabase
        .from('tenant_subscriptions')
        .select('tenant_id, plan_id')
        .eq('dodo_subscription_id', subscriptionId)
        .single();

      if (subscription) {
        const amount = paymentData.data?.object?.amount_paid || 
                      paymentData.amount || 
                      null;

        await supabase.from('upgrade_history').insert({
          tenant_id: subscription.tenant_id,
          plan_id: subscription.plan_id,
          amount_paid: amount,
          dodo_payment_id: paymentData.id || null,
          status: 'completed',
          processed_at: new Date().toISOString()
        });
      }
    } catch (err) {
      console.warn('⚠️ handlePaymentSuccess failed:', err.message);
    }
  }

  async handlePaymentFailure(subscriptionId, paymentData) {
    try {
      if (subscriptionId) {
        const gracePeriodUntil = this.calculatePeriodEnd(7); // 7-day grace period
        
        await supabase
          .from('tenant_subscriptions')
          .update({ 
            grace_period_until: gracePeriodUntil,
            updated_at: new Date().toISOString()
          })
          .eq('dodo_subscription_id', subscriptionId);

        // Log the failed payment event
        const { data: subscription } = await supabase
          .from('tenant_subscriptions')
          .select('tenant_id')
          .eq('dodo_subscription_id', subscriptionId)
          .single();

        if (subscription) {
          await this.logSubscriptionEvent(subscription.tenant_id, 'payment_failed', {
            subscription_id: subscriptionId,
            grace_period_until: gracePeriodUntil,
            payment_data: paymentData
          });
        }
      }
    } catch (err) {
      console.warn('⚠️ handlePaymentFailure failed:', err.message);
    }
  }

  async handleSubscriptionCanceled(subscriptionId, subscriptionData) {
    try {
      if (!subscriptionId) return;
      
      await supabase
        .from('tenant_subscriptions')
        .update({ 
          status: 'canceled', 
          canceled_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('dodo_subscription_id', subscriptionId);
    } catch (err) {
      console.warn('⚠️ handleSubscriptionCanceled failed:', err.message);
    }
  }

  async handleSubscriptionUpdated(subscriptionId, subscriptionData) {
    try {
      if (!subscriptionId) return;
      
      // Update subscription details if needed
      const updates = {};
      
      if (subscriptionData.status) {
        updates.status = subscriptionData.status;
      }
      
      if (subscriptionData.current_period_end) {
        updates.current_period_end = subscriptionData.current_period_end;
      }
      
      if (subscriptionData.cancel_at_period_end !== undefined) {
        updates.canceled_at = subscriptionData.cancel_at_period_end ? 
          subscriptionData.current_period_end : null;
      }
      
      updates.updated_at = new Date().toISOString();
      
      if (Object.keys(updates).length > 0) {
        await supabase
          .from('tenant_subscriptions')
          .update(updates)
          .eq('dodo_subscription_id', subscriptionId);
      }
    } catch (err) {
      console.warn('⚠️ handleSubscriptionUpdated failed:', err.message);
    }
  }

  async handleSubscriptionCreated(subscriptionId, subscriptionData) {
    try {
      if (!subscriptionId) return;
      
      console.log(`🎉 New subscription created: ${subscriptionId}`);
      // Subscription already handled in createSubscription method
    } catch (err) {
      console.warn('⚠️ handleSubscriptionCreated failed:', err.message);
    }
  }
}

module.exports = new PaymentService();