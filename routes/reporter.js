const express = require('express');
const router = express.Router();
const reporterService = require('../services/reporter-service');
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

// Generate and send report (protected)
router.post('/generate', verifyWebhook, async (req, res) => {
    try {
        const { report_config_id, tenant_id } = req.body;
        
        if (!report_config_id || !tenant_id) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing report_config_id or tenant_id' 
            });
        }

        console.log(`🚀 Reporter triggered for config: ${report_config_id}`);
        
        const result = await reporterService.generateAndSendReport(report_config_id, tenant_id);
        
        res.json(result);

    } catch (error) {
        console.error('Reporter route error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Test endpoint (unprotected)
router.post('/test', async (req, res) => {
    try {
        // Use a test report config ID for demonstration
        const testConfigId = '3bce31b7-b045-4da0-981c-db138e866cfe'; // Replace with actual test ID
        const testTenantId = '3bce31b7-b045-4da0-981c-db138e866cfe'; // Replace with actual test ID
        
        const result = await reporterService.generateAndSendReport(testConfigId, testTenantId);
        
        res.json({
            ...result,
            note: 'This was a test run with mock data'
        });

    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

module.exports = router;