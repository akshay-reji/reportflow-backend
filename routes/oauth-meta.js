// routes/oauth-meta.js - MANUAL TOKEN ROUTES
const express = require('express');
const router = express.Router();
const metaOAuthService = require('../services/oauth-meta-service');
const supabase = require('../lib/supabase');

// 🎯 1. MANUAL CONNECTION ENDPOINT (POST)
router.post('/connect-manual', async (req, res) => {
  try {
    const { tenant_id, report_config_id, access_token, ad_account_id } = req.body;

    if (!tenant_id || !report_config_id || !access_token || !ad_account_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: tenant_id, report_config_id, access_token, ad_account_id'
      });
    }

    console.log(`🔗 Manual connection attempt for tenant: ${tenant_id}`);
    const result = await metaOAuthService.storeManualToken(tenant_id, report_config_id, access_token, ad_account_id);
    res.json(result);

  } catch (error) {
    console.error('❌ Manual connection failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 🎯 2. TOKEN STATUS CHECK (GET)
router.get('/status', async (req, res) => {
  try {
    const { tenant_id, report_config_id } = req.query;
    if (!tenant_id || !report_config_id) {
      return res.status(400).json({ error: 'Missing tenant_id or report_config_id' });
    }

    const status = await metaOAuthService.getTokenStatus(tenant_id, report_config_id);
    res.json({
      success: true,
      ...status
    });

  } catch (error) {
    console.error('❌ Status check failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🎯 3. DISCONNECT META ADS
router.post('/disconnect', async (req, res) => {
  try {
    const { tenant_id, report_config_id } = req.body;
    if (!tenant_id || !report_config_id) {
      return res.status(400).json({ error: 'Missing tenant_id or report_config_id' });
    }

    console.log(`🗑️ Disconnecting Meta Ads for tenant: ${tenant_id}`);
    const { error } = await supabase
      .from('report_configs')
      .update({ sources: supabase.raw(`sources - 'meta_ads'`) })
      .eq('id', report_config_id)
      .eq('tenant_id', tenant_id);

    if (error) throw error;
    res.json({ success: true, message: 'Meta Ads disconnected successfully' });

  } catch (error) {
    console.error('❌ Disconnect failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🎯 4. TEST DATA FETCH (Protected or Unprotected - your choice)
router.post('/test-fetch', async (req, res) => {
  try {
    const { tenant_id, report_config_id } = req.body;
    if (!tenant_id || !report_config_id) {
      return res.status(400).json({ error: 'Missing tenant_id or report_config_id' });
    }

    console.log(`🧪 Testing Meta data fetch for tenant: ${tenant_id}`);
    const metaData = await metaOAuthService.fetchMetaAdsData(tenant_id, report_config_id);

    res.json({
      success: true,
      message: 'Meta data fetched successfully!',
      data: metaData,
      data_quality: metaData.data_quality // Shows 'REAL_META_DATA' or 'ENHANCED_MOCK_DATA'
    });

  } catch (error) {
    console.error('❌ Meta data test failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🎯 5. COMPREHENSIVE TEST & INSTRUCTION PAGE (GET - for your browser)
router.get('/test-complete', async (req, res) => {
  try {
    const testTenantId = req.query.tenant_id || '3bce31b7-b045-4da0-981c-db138e866cfe';
    const testConfigId = req.query.report_config_id || 'e51bc18e-a9f4-4501-a33f-6b478b689289';

    // Check current connection status
    let connectionStatus = { connected: false };
    try {
      const status = await metaOAuthService.getTokenStatus(testTenantId, testConfigId);
      connectionStatus = status;
    } catch (e) {
      console.log('🔍 No Meta connection found for test page.');
    }

    // Send the HTML page with instructions and connection form
    res.send(`
      <html>
        <head>
          <title>ReportFlow - Meta Ads Manual Connection</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; background: #f5f5f5; }
            .card { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin: 20px 0; }
            .status-connected { border-left: 4px solid #27ae60; }
            .status-disconnected { border-left: 4px solid #e74c3c; }
            .btn { background: #1877F2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px 5px; cursor:pointer; border:none; }
            .btn-success { background: #27ae60; }
            .form-group { margin: 15px 0; }
            label { display: block; margin-bottom: 5px; font-weight: bold; }
            input, textarea { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px; }
            .instructions { background: #f0f7ff; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .step { margin: 15px 0; padding-left: 20px; border-left: 3px solid #1877F2; }
            .json { background: #f8f9fa; padding: 15px; border-radius: 5px; font-family: monospace; font-size: 12px; overflow: auto; }
          </style>
        </head>
        <body>
          <div style="max-width: 800px; margin: 0 auto;">
            <h1>📱 Meta Ads Manual Connection</h1>
            <p>Connect your Meta Ads account using a manual access token.</p>

            <!-- Connection Status -->
            <div class="card ${connectionStatus.connected ? 'status-connected' : 'status-disconnected'}">
              <h2>📊 Connection Status</h2>
              ${connectionStatus.connected ? `
                <div style="color: #27ae60; font-weight: bold;">✅ Connected to Meta Ads</div>
                <p><strong>Ad Account:</strong> ${connectionStatus.ad_account_id || 'N/A'}</p>
                <p><strong>Connection Type:</strong> ${connectionStatus.connection_type || 'Manual Token'}</p>
                ${!connectionStatus.is_expired ? `<p><strong>Token Expires in:</strong> ${connectionStatus.days_until_expiry} days</p>` : `<p style="color: #e74c3c;"><strong>Token Expired!</strong></p>`}
              ` : `
                <div style="color: #e74c3c; font-weight: bold;">❌ Not Connected</div>
                <p>Follow the instructions below to connect using a manual access token.</p>
              `}
            </div>

            <!-- Manual Connection Form -->
            <div class="card">
              <h2>🔗 Connect Meta Ads Manually</h2>
              <div class="instructions">
                <h3>📝 How to Get Your Access Token:</h3>
                <div class="step">
                  <h4>Step 1: Go to Meta Graph API Explorer</h4>
                  <p>Visit: <a href="https://developers.facebook.com/tools/explorer/" target="_blank">https://developers.facebook.com/tools/explorer/</a></p>
                </div>
                <div class="step">
                  <h4>Step 2: Select Your App & Get Token</h4>
                  <p>Select "<strong>ReportFlow-Dev</strong>" from the dropdown. Click "Generate Access Token".</p>
                  <p>Add these permissions: <code>ads_management</code>, <code>ads_read</code>, <code>business_management</code>.</p>
                </div>
                <div class="step">
                  <h4>Step 3: Find Your Ad Account ID</h4>
                  <p>Go to <a href="https://www.facebook.com/adsmanager" target="_blank">Ads Manager</a>. Your Ad Account ID is in the URL: <code>act_123456789012345</code></p>
                </div>
              </div>

              <form id="manualConnectionForm">
                <div class="form-group">
                  <label for="access_token">Meta Access Token:</label>
                  <textarea id="access_token" name="access_token" rows="3" placeholder="Paste the long User Access Token from Graph API Explorer" required></textarea>
                </div>
                <div class="form-group">
                  <label for="ad_account_id">Ad Account ID:</label>
                  <input type="text" id="ad_account_id" name="ad_account_id" placeholder="act_123456789012345" required>
                </div>
                <div class="form-group">
                  <label for="tenant_id">Tenant ID:</label>
                  <input type="text" id="tenant_id" name="tenant_id" value="${testTenantId}" required>
                </div>
                <div class="form-group">
                  <label for="report_config_id">Report Config ID:</label>
                  <input type="text" id="report_config_id" name="report_config_id" value="${testConfigId}" required>
                </div>
                <button type="submit" class="btn btn-success">Connect Meta Ads</button>
              </form>
              <div id="connectionResult" style="margin-top: 20px;"></div>
            </div>

            <!-- Test Actions -->
            <div class="card">
              <h2>🧪 Test Integration</h2>
              <div style="margin-bottom: 15px;">
                <button class="btn" onclick="testFetch()">Test Data Fetching</button>
                <button class="btn" onclick="checkStatus()">Check Status</button>
                ${connectionStatus.connected ? `<button class="btn" style="background: #e74c3c;" onclick="disconnect()">Disconnect</button>` : ''}
              </div>
              <pre id="testResult" class="json">Test results will appear here...</pre>
            </div>
          </div>

          <script>
            // Handle form submission for manual connection
            document.getElementById('manualConnectionForm').addEventListener('submit', async (e) => {
              e.preventDefault();
              const resultDiv = document.getElementById('connectionResult');
              resultDiv.innerHTML = '<p style="color: #f39c12;">🔄 Connecting...</p>';

              const data = {
                tenant_id: document.getElementById('tenant_id').value,
                report_config_id: document.getElementById('report_config_id').value,
                access_token: document.getElementById('access_token').value,
                ad_account_id: document.getElementById('ad_account_id').value
              };

              try {
                const response = await fetch('/api/oauth/meta/connect-manual', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(data)
                });
                const result = await response.json();
                if (result.success) {
                  resultDiv.innerHTML = '<p style="color: #27ae60;">✅ ' + result.message + '</p>';
                  setTimeout(() => window.location.reload(), 1500); // Reload to update status
                } else {
                  resultDiv.innerHTML = '<p style="color: #e74c3c;">❌ ' + result.error + '</p>';
                }
              } catch (error) {
                resultDiv.innerHTML = '<p style="color: #e74c3c;">❌ Network error: ' + error.message + '</p>';
              }
            });

            // Test functions
            async function testFetch() {
              const resultEl = document.getElementById('testResult');
              resultEl.textContent = 'Testing...';
              const data = {
                tenant_id: document.getElementById('tenant_id').value,
                report_config_id: document.getElementById('report_config_id').value
              };
              try {
                const response = await fetch('/api/oauth/meta/test-fetch', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(data)
                });
                const result = await response.json();
                resultEl.textContent = JSON.stringify(result, null, 2);
              } catch (error) {
                resultEl.textContent = 'Error: ' + error.message;
              }
            }

            async function checkStatus() {
              const resultEl = document.getElementById('testResult');
              resultEl.textContent = 'Checking...';
              const tenantId = document.getElementById('tenant_id').value;
              const configId = document.getElementById('report_config_id').value;
              try {
                const response = await fetch('/api/oauth/meta/status?tenant_id=' + tenantId + '&report_config_id=' + configId);
                const result = await response.json();
                resultEl.textContent = JSON.stringify(result, null, 2);
              } catch (error) {
                resultEl.textContent = 'Error: ' + error.message;
              }
            }

            async function disconnect() {
              if (!confirm('Are you sure you want to disconnect Meta Ads?')) return;
              const resultEl = document.getElementById('testResult');
              resultEl.textContent = 'Disconnecting...';
              const data = {
                tenant_id: document.getElementById('tenant_id').value,
                report_config_id: document.getElementById('report_config_id').value
              };
              try {
                const response = await fetch('/api/oauth/meta/disconnect', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(data)
                });
                const result = await response.json();
                resultEl.textContent = JSON.stringify(result, null, 2);
                if (result.success) {
                  setTimeout(() => window.location.reload(), 1500);
                }
              } catch (error) {
                resultEl.textContent = 'Error: ' + error.message;
              }
            }
          </script>
        </body>
      </html>
    `);

  } catch (error) {
    console.error('❌ Test suite page failed:', error);
    res.status(500).send('<h1>Error loading test page</h1><p>' + error.message + '</p>');
  }
});

module.exports = router;