const express = require('express');
const router = express.Router();
const schedulerService = require('../services/scheduler-service');
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

// Manual trigger endpoint (protected)
router.post('/run', verifyWebhook, async (req, res) => {
  try {
    const result = await schedulerService.executeScheduler();
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Test endpoint (unprotected for testing)
router.post('/test', async (req, res) => {
  try {
    const result = await schedulerService.executeScheduler();
    res.json({
      ...result,
      note: 'This was a test run without webhook verification'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;