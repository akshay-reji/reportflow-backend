// services/payment-service.js
const fetch = require('node-fetch'); // or axios if you use it
const supabase = require('../lib/supabase');

const DODO_BASE = process.env.DODO_API_URL.replace(/\/+$/, ''); // trim trailing slash
const API_KEY = process.env.DODO_API_KEY;
const DEFAULT_TIMEOUT_MS = 10_000;

// helper to try multiple paths
async function tryPaths(method = 'POST', body = null, paths = []) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${API_KEY}`
  };

  for (const p of paths) {
    const url = `${DODO_BASE}${p}`; // p should include leading slash
    try {
      console.log(`💳 PaymentService: trying ${method} ${url}`);
      const resp = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        timeout: DEFAULT_TIMEOUT_MS
      });

      const text = await resp.text();
      let json;
      try { json = text ? JSON.parse(text) : null; } catch (e) { json = text; }

      if (resp.ok) {
        console.log(`✅ PaymentService: ${method} ${url} OK`);
        return { ok: true, status: resp.status, data: json };
      } else {
        console.warn(`⚠️ PaymentService: ${method} ${url} -> ${resp.status}`, json);
        // continue trying other variants
      }
    } catch (err) {
      console.error(`❌ PaymentService: ${method} ${url} error:`, err.message || err);
    }
  }

  return { ok: false, status: 404, error: 'All endpoints returned errors' };
}

module.exports = {
  async createCustomer(tenantId, payload = {}) {
    // common likely endpoints to try (order matters)
    const candidatePaths = [
      '/v1/customers',
      '/api/v1/customers',
      '/customers',
      '/api/customers'
    ];

    const result = await tryPaths('POST', payload, candidatePaths);

    if (!result.ok) throw new Error(`Dodo createCustomer failed: ${result.status} ${result.error || JSON.stringify(result.data)}`);

    // optionally store mapping tenantId -> dodoCustomerId in tenants table
    try {
      const dodoCustomer = result.data;
      await supabase.from('tenants').update({ dodo_customer_id: dodoCustomer?.id }).eq('id', tenantId);
    } catch (err) {
      console.warn('Failed to persist dodo customer id', err.message);
    }

    return result.data;
  },

  async createSubscription(tenantId, dodoCustomerId, priceId, payload = {}) {
    // subscription endpoints to try
    const candidatePaths = [
      '/v1/subscriptions',
      '/api/v1/subscriptions',
      '/subscriptions',
      '/api/subscriptions'
    ];

    const body = Object.assign({}, payload, { customer: dodoCustomerId, price_id: priceId });
    const result = await tryPaths('POST', body, candidatePaths);

    if (!result.ok) throw new Error(`Dodo createSubscription failed: ${result.status} ${result.error || JSON.stringify(result.data)}`);

    // persist subscription (optional)
    try {
      await supabase.from('subscription_events').insert({
        tenant_id: tenantId,
        event_type: 'subscription_created',
        metadata: result.data
      });
    } catch (err) {
      console.warn('Failed to persist subscription event', err.message);
    }

    return result.data;
  },

  // store webhook event idempotently
  async handleWebhookEvent(eventId, tenantId, eventType, payload) {
    // use subscription_events table to keep idempotent records
    try {
      const { data, error } = await supabase
        .from('subscription_events')
        .insert({
          tenant_id: tenantId,
          event_type,
          metadata: payload,
          /* you can store the event id in metadata or an event_id column if you add it */
        }, { onConflict: 'tenant_id,event_type' }); // optionally make a unique index if you want
      if (error) {
        console.warn('Webhook store error', error.message);
      }
      return data;
    } catch (err) {
      console.error('Webhook store exception', err.message);
      return null;
    }
  }
};
