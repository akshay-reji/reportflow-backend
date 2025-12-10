// routes/payment.js
const express = require('express');
const router = express.Router();
const paymentService = require('../services/payment-service');
const crypto = require('crypto');
const supabase = require('../lib/supabase');

// Create customer - internal endpoint that calls Dodo
router.post('/create-customer', async (req, res) => {
  try {
    const { tenant_id, customer } = req.body;
    if (!tenant_id || !customer) return res.status(400).json({ success: false, error: 'tenant_id & customer required' });

    const dodoCustomer = await paymentService.createCustomer(tenant_id, customer);
    res.json({ success: true, customer: dodoCustomer });
  } catch (err) {
    console.error('create-customer error', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create subscription
router.post('/create-subscription', async (req, res) => {
  try {
    const { tenant_id, dodo_customer_id, price_id } = req.body;
    if (!tenant_id || !dodo_customer_id || !price_id) return res.status(400).json({ success: false, error: 'missing params' });

    const subscription = await paymentService.createSubscription(tenant_id, dodo_customer_id, price_id);
    res.json({ success: true, subscription });
  } catch (err) {
    console.error('create-subscription error', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// IMPORTANT: use express.raw() for webhook to preserve raw body for signature calc
// In your server.js where you mount routes, do:
// app.use('/api/payment/webhook', express.raw({ type: '*/*' }), paymentWebhookRouter);

function verifyDodoSignature(rawBody, signatureHeader) {
  const secret = process.env.DODO_WEBHOOK_SIGNING_SECRET || process.env.WEBHOOK_SIGNING_SECRET;
  if (!secret) {
    console.warn('No DODO_WEBHOOK_SIGNING_SECRET set - skipping signature verification (not recommended)');
    return false;
  }
  const computed = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  // sometimes header includes "sha256=" prefix — handle both
  const cleanHeader = (signatureHeader || '').replace(/^sha256=/, '');
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(cleanHeader));
}

// Webhook receiver (mounted with express.raw)
router.post('/webhook', async (req, res) => {
  try {
    const rawBody = req.body; // Buffer when using express.raw
    const signatureHeader = req.headers['x-dodo-signature'] || req.headers['x-signature'] || req.headers['x-reportflow-signature'];

    // verify signature
    if (process.env.DODO_WEBHOOK_SIGNING_SECRET) {
      const ok = verifyDodoSignature(rawBody, signatureHeader);
      if (!ok) {
        console.warn('Webhook signature verification failed');
        return res.status(401).send('Invalid signature');
      }
    }

    const payloadText = rawBody.toString('utf8');
    const payload = JSON.parse(payloadText);

    // idempotency: use event id from payload (common: payload.id or payload.event_id)
    const eventId = payload.id || payload.event_id || payload.data?.id || `${Date.now()}`;

    // quick check: ignore if we've processed already (lookup subscription_events by unique event id stored in metadata)
    const existing = await supabase
      .from('subscription_events')
      .select('*')
      .eq('metadata->>event_id', String(eventId))
      .limit(1);

    if (existing?.data?.length) {
      console.log('Duplicate webhook received, ignoring', eventId);
      return res.status(200).send('already_processed');
    }

    // process event (map Dodo event types to our internal actions)
    const eventType = payload.type || payload.event || 'unknown';
    const tenantId = payload.metadata?.tenant_id || null; // recommend adding tenant_id in Dodo metadata at creation time

    // store event & respond
    await supabase.from('subscription_events').insert({
      tenant_id: tenantId,
      event_type: eventType,
      metadata: payload
    });

    // run any business logic (mark subscription active/cancelled etc.)
    // TODO: interpret payload.data or payload.object depending on Dodo shape

    res.status(200).send('ok');
  } catch (err) {
    console.error('Webhook handler error', err.message);
    res.status(500).send('error');
  }
});

module.exports = router;
