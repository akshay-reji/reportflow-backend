// routes/payment.js
const express = require('express');
const router = express.Router();
const paymentService = require('../services/payment-service');

// 🎯 CREATE CUSTOMER
router.post('/create-customer', async (req, res) => {
  try {
    const { tenant_id, customer_data } = req.body;
    console.log(`🔄 Creating Dodo customer for tenant: ${tenant_id}`);
    const result = await paymentService.createCustomer(tenant_id, customer_data);
    res.json(result);
  } catch (error) {
    console.error('❌ Route: create-customer failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🎯 CREATE SUBSCRIPTION
router.post('/create-subscription', async (req, res) => {
  try {
    const { tenant_id, plan_id } = req.body;
    console.log(`🔄 Creating Dodo subscription for tenant: ${tenant_id}, plan: ${plan_id}`);
    const result = await paymentService.createSubscription(tenant_id, plan_id);
    res.json(result);
  } catch (error) {
    console.error('❌ Route: create-subscription failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🤖 WEBHOOK ENDPOINT (for Dodo to call)
router.post('/webhook', (req, res) => paymentService.handleWebhook(req, res));

module.exports = router;