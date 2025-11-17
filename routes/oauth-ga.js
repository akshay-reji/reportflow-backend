// routes/oauth-ga.js - COMPLETE IMPLEMENTATION
const express = require('express');
const router = express.Router();
const gaOAuthService = require('../services/oauth-ga-service');
const supabase = require('../lib/supabase');
const crypto = require('crypto');

// Verify webhook secret middleware (for protected routes)
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

// 🎯 INITIATE GOOGLE ANALYTICS OAUTH FLOW
router.get('/auth', async (req, res) => {
  try {
    const { tenant_id, report_config_id, property_id } = req.query;
    
    if (!tenant_id || !report_config_id) {
      return res.status(400).send(`
        <html>
          <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
            <h1 style="color: #e74c3c;">❌ Missing Parameters</h1>
            <p>Required: tenant_id and report_config_id</p>
            <a href="/api/oauth/ga/test-complete" style="color: #2c5aa0;">Go to Test Suite</a>
          </body>
        </html>
      `);
    }

    console.log(`🚀 Initiating GA OAuth for tenant: ${tenant_id}, config: ${report_config_id}`);

    // Generate OAuth URL
    const authUrl = gaOAuthService.generateAuthUrl(tenant_id, report_config_id, property_id);
    
    res.send(`
      <html>
        <head>
          <title>ReportFlow - Connect Google Analytics</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; text-align: center; background: #f5f5f5; }
            .card { background: white; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 500px; margin: 0 auto; }
            .btn { background: #2c5aa0; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 20px 0; }
            .info { background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; text-align: left; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>🔗 Connect Google Analytics</h1>
            <p>Click the button below to connect your Google Analytics account to ReportFlow.</p>
            
            <div class="info">
              <h3>Connection Details:</h3>
              <p><strong>Tenant ID:</strong> ${tenant_id}</p>
              <p><strong>Report Config:</strong> ${report_config_id}</p>
              ${property_id ? `<p><strong>Property ID:</strong> ${property_id}</p>` : ''}
            </div>
            
            <a href="${authUrl}" class="btn">Connect Google Analytics</a>
            
            <p><small>You'll be redirected to Google to authorize access to your Analytics data.</small></p>
            
            <div style="margin-top: 30px;">
              <a href="/api/oauth/ga/test-complete" style="color: #666;">← Back to Test Suite</a>
            </div>
          </div>
        </body>
      </html>
    `);

  } catch (error) {
    console.error('❌ GA OAuth initiation failed:', error);
    res.status(500).send(`
      <html>
        <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
          <h1 style="color: #e74c3c;">❌ OAuth Initiation Failed</h1>
          <p>Error: ${error.message}</p>
          <a href="/api/oauth/ga/test-complete" style="color: #2c5aa0;">Try Again</a>
        </body>
      </html>
    `);
  }
});

// 🔄 ENHANCED CALLBACK HANDLER (Backend-only with HTML)
router.get('/callback', async (req, res) => {
  try {
    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
      console.error('❌ OAuth callback error:', oauthError);
      return res.send(`
        <html>
          <head>
            <title>ReportFlow - OAuth Failed</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 40px; text-align: center; background: #f5f5f5; }
              .card { background: white; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 500px; margin: 0 auto; }
              .error { color: #e74c3c; font-size: 48px; margin-bottom: 20px; }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="error">❌</div>
              <h1>OAuth Authorization Failed</h1>
              <p>Google returned an error: <strong>${oauthError}</strong></p>
              <p>This usually happens if you denied access or there was an issue with the authorization request.</p>
              <div style="margin-top: 30px;">
                <a href="/api/oauth/ga/test-complete" style="background: #2c5aa0; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px;">
                  Try Again
                </a>
              </div>
            </div>
          </body>
        </html>
      `);
    }

    if (!code || !state) {
      return res.send(`
        <html>
          <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
            <h1 style="color: #e74c3c;">❌ Invalid Callback</h1>
            <p>Missing code or state parameters from Google</p>
            <a href="/api/oauth/ga/test-complete" style="color: #2c5aa0;">Try Again</a>
          </body>
        </html>
      `);
    }

    console.log('🔄 Processing GA OAuth callback...');

    // Process the callback
    const result = await gaOAuthService.handleCallback(code, state);

    // Enhanced success page with comprehensive details
    res.send(`
      <html>
        <head>
          <title>ReportFlow - Google Analytics Connected</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; text-align: center; background: #f5f5f5; }
            .card { background: white; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 600px; margin: 0 auto; }
            .success { color: #27ae60; font-size: 48px; margin-bottom: 20px; }
            .data { background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; text-align: left; font-family: monospace; font-size: 12px; overflow-x: auto; }
            .btn { background: #2c5aa0; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px; }
            .step { background: #e8f4fd; padding: 15px; border-radius: 5px; margin: 15px 0; text-align: left; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="success">✅</div>
            <h1>Google Analytics Connected!</h1>
            <p>Your Google Analytics account has been successfully connected to ReportFlow.</p>
            
            <div class="step">
              <h3>🎉 Connection Successful</h3>
              <p>Tokens stored securely and property information retrieved.</p>
            </div>
            
            <div class="data">
              <strong>Connection Summary:</strong>
              <pre>${JSON.stringify({
                tenantId: result.tenantId,
                reportConfigId: result.reportConfigId,
                property: result.property?.accountName || 'Basic Access',
                connectedAt: new Date().toISOString(),
                tokensStored: result.tokensStored
              }, null, 2)}</pre>
            </div>
            
            <div class="step">
              <h3>🚀 Next Steps</h3>
              <p>Test your connection by fetching real Google Analytics data:</p>
            </div>
            
            <div>
              <a href="/api/oauth/ga/test-fetch-page?tenant_id=${result.tenantId}&report_config_id=${result.reportConfigId}" class="btn">
                Test Data Fetching
              </a>
              <a href="/api/oauth/ga/status?tenant_id=${result.tenantId}&report_config_id=${result.reportConfigId}" class="btn" style="background: #27ae60;">
                Check Connection Status
              </a>
              <a href="/api/oauth/ga/test-complete" class="btn" style="background: #666;">
                Back to Test Suite
              </a>
            </div>
          </div>
        </body>
      </html>
    `);

  } catch (error) {
    console.error('❌ GA OAuth callback processing failed:', error);
    res.send(`
      <html>
        <head>
          <title>ReportFlow - Connection Failed</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; text-align: center; background: #f5f5f5; }
            .card { background: white; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 500px; margin: 0 auto; }
            .error { color: #e74c3c; font-size: 48px; margin-bottom: 20px; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="error">❌</div>
            <h1>Connection Failed</h1>
            <p>We encountered an error while connecting to Google Analytics:</p>
            <div style="background: #ffeaea; padding: 15px; border-radius: 5px; margin: 20px 0; text-align: left;">
              <strong>Error:</strong> ${error.message}
            </div>
            <p>This could be due to:</p>
            <ul style="text-align: left; margin: 20px 0;">
              <li>Invalid OAuth state (security protection)</li>
              <li>Network connectivity issues</li>
              <li>Google API service disruption</li>
              <li>Insufficient permissions for the selected account</li>
            </ul>
            <div style="margin-top: 30px;">
              <a href="/api/oauth/ga/test-complete" style="background: #2c5aa0; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px;">
                Try Again
              </a>
            </div>
          </div>
        </body>
      </html>
    `);
  }
});

// 🏆 COMPREHENSIVE TEST SUITE WITH UI
router.get('/test-complete', async (req, res) => {
  try {
    // Use existing test data or allow custom input
    const testTenantId = req.query.tenant_id || '3bce31b7-b045-4da0-981c-db138e866cfe';
    const testConfigId = req.query.report_config_id || 'e51bc18e-a9f4-4501-a33f-6b478b689289';
    
    // Check current connection status
    let connectionStatus = { connected: false };
    try {
      const statusResponse = await supabase
        .from('report_configs')
        .select('sources')
        .eq('id', testConfigId)
        .eq('tenant_id', testTenantId)
        .single();

      if (statusResponse.data?.sources?.google_analytics) {
        connectionStatus = {
          connected: true,
          connected_at: statusResponse.data.sources.google_analytics.connected_at,
          property: statusResponse.data.sources.google_analytics.property_info
        };
      }
    } catch (error) {
      // Status check failed - not connected
    }

    res.send(`
      <html>
        <head>
          <title>ReportFlow - GA OAuth Test Suite</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; background: #f5f5f5; }
            .card { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin: 20px 0; }
            .status-connected { border-left: 4px solid #27ae60; }
            .status-disconnected { border-left: 4px solid #e74c3c; }
            .btn { background: #2c5aa0; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px 5px; }
            .btn-success { background: #27ae60; }
            .btn-warning { background: #f39c12; }
            .step { background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0; }
            .form-group { margin: 15px 0; }
            label { display: block; margin-bottom: 5px; font-weight: bold; }
            input { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px; }
          </style>
        </head>
        <body>
          <div style="max-width: 800px; margin: 0 auto;">
            <h1>🔧 Google Analytics OAuth Test Suite</h1>
            <p>Complete testing workflow for GA OAuth integration</p>
            
            <!-- Connection Status -->
            <div class="card ${connectionStatus.connected ? 'status-connected' : 'status-disconnected'}">
              <h2>📊 Connection Status</h2>
              ${connectionStatus.connected ? `
                <div style="color: #27ae60; font-weight: bold;">✅ Connected to Google Analytics</div>
                <p><strong>Connected:</strong> ${new Date(connectionStatus.connected_at).toLocaleString()}</p>
                ${connectionStatus.property ? `<p><strong>Account:</strong> ${connectionStatus.property.accountName || 'Basic Access'}</p>` : ''}
              ` : `
                <div style="color: #e74c3c; font-weight: bold;">❌ Not Connected</div>
                <p>Google Analytics is not connected yet.</p>
              `}
            </div>

            <!-- Test Workflow Steps -->
            <div class="card">
              <h2>🚀 Test Workflow</h2>
              
              <div class="step">
                <h3>Step 1: Configure Test Data</h3>
                <form action="/api/oauth/ga/test-complete" method="get">
                  <div class="form-group">
                    <label for="tenant_id">Tenant ID:</label>
                    <input type="text" id="tenant_id" name="tenant_id" value="${testTenantId}" required>
                  </div>
                  <div class="form-group">
                    <label for="report_config_id">Report Config ID:</label>
                    <input type="text" id="report_config_id" name="report_config_id" value="${testConfigId}" required>
                  </div>
                  <button type="submit" class="btn">Update Test Data</button>
                </form>
              </div>

              <div class="step">
                <h3>Step 2: Connect Google Analytics</h3>
                <p>Initiate the OAuth flow to connect your Google Analytics account.</p>
                <a href="/api/oauth/ga/auth?tenant_id=${testTenantId}&report_config_id=${testConfigId}" class="btn">
                  ${connectionStatus.connected ? 'Reconnect Google Analytics' : 'Connect Google Analytics'}
                </a>
              </div>

              ${connectionStatus.connected ? `
                <div class="step">
                  <h3>Step 3: Test Data Fetching</h3>
                  <p>Fetch real data from your connected Google Analytics account.</p>
                  <a href="/api/oauth/ga/test-fetch-page?tenant_id=${testTenantId}&report_config_id=${testConfigId}" class="btn btn-success">
                    Test Data Fetching
                  </a>
                  <a href="/api/oauth/ga/status?tenant_id=${testTenantId}&report_config_id=${testConfigId}" class="btn">
                    Check Status
                  </a>
                </div>

                <div class="step">
                  <h3>Step 4: Advanced Features</h3>
                  <p>Test revolutionary features that nobody else has:</p>
                  <a href="/api/oauth/ga/test-advanced?tenant_id=${testTenantId}&report_config_id=${testConfigId}" class="btn btn-warning">
                    Test Advanced Features
                  </a>
                </div>
              ` : ''}
            </div>

            <!-- API Documentation -->
            <div class="card">
              <h2>📚 API Endpoints</h2>
              <div class="step">
                <h4>Available Endpoints:</h4>
                <ul>
                  <li><strong>GET /auth</strong> - Initiate OAuth flow</li>
                  <li><strong>GET /callback</strong> - OAuth callback handler</li>
                  <li><strong>GET /status</strong> - Check connection status</li>
                  <li><strong>POST /test-fetch</strong> - Fetch GA data (API)</li>
                  <li><strong>GET /test-fetch-page</strong> - Fetch GA data (UI)</li>
                  <li><strong>POST /predictive-insights</strong> - AI predictions</li>
                  <li><strong>POST /detect-anomalies</strong> - Anomaly detection</li>
                  <li><strong>POST /multi-property</strong> - Multi-property aggregation</li>
                </ul>
              </div>
            </div>

            <!-- Quick Actions -->
            <div class="card">
              <h2>⚡ Quick Actions</h2>
              <div>
                <a href="/api/health" class="btn" style="background: #666;">System Health</a>
                <a href="/api/debug-routes" class="btn" style="background: #666;">Debug Routes</a>
                <a href="/api/reporter/test" class="btn" style="background: #666;">Test Reporter</a>
              </div>
            </div>
          </div>
        </body>
      </html>
    `);

  } catch (error) {
    console.error('❌ Test suite failed:', error);
    res.status(500).send(`
      <html>
        <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
          <h1 style="color: #e74c3c;">❌ Test Suite Error</h1>
          <p>Error: ${error.message}</p>
          <a href="/api/oauth/ga/test-complete" style="color: #2c5aa0;">Try Again</a>
        </body>
      </html>
    `);
  }
});

// 📊 DATA FETCH TEST WITH RESULTS DISPLAY
router.get('/test-fetch-page', async (req, res) => {
  try {
    const { tenant_id, report_config_id, date_range = '7daysAgo' } = req.query;
    
    if (!tenant_id || !report_config_id) {
      return res.status(400).send(`
        <html>
          <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
            <h1 style="color: #e74c3c;">❌ Missing Parameters</h1>
            <p>Required: tenant_id and report_config_id</p>
            <a href="/api/oauth/ga/test-complete" style="color: #2c5aa0;">Go to Test Suite</a>
          </body>
        </html>
      `);
    }

    console.log(`📊 Testing GA data fetch for tenant: ${tenant_id}`);

    // Fetch real GA data
    const gaData = await gaOAuthService.fetchGA4Data(
      tenant_id, 
      report_config_id, 
      { startDate: date_range, endDate: 'today' }
    );

    // Display results in a beautiful UI
    res.send(`
      <html>
        <head>
          <title>ReportFlow - GA Data Test</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; background: #f5f5f5; }
            .card { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin: 20px 0; }
            .metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }
            .metric-card { background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; border-left: 4px solid #2c5aa0; }
            .metric-value { font-size: 24px; font-weight: bold; color: #2c5aa0; }
            .metric-label { font-size: 14px; color: #666; margin-top: 5px; }
            .data-section { background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; }
            pre { background: #2d3748; color: #e2e8f0; padding: 15px; border-radius: 5px; overflow-x: auto; font-size: 12px; }
            .btn { background: #2c5aa0; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 5px; }
          </style>
        </head>
        <body>
          <div style="max-width: 1000px; margin: 0 auto;">
            <h1>📊 Google Analytics Data Test</h1>
            <p>Real data fetched from your connected Google Analytics account</p>
            
            <!-- Summary Metrics -->
            <div class="card">
              <h2>📈 Key Metrics</h2>
              <div class="metric-grid">
                <div class="metric-card">
                  <div class="metric-value">${gaData.summary?.totalSessions || 0}</div>
                  <div class="metric-label">Total Sessions</div>
                </div>
                <div class="metric-card">
                  <div class="metric-value">${gaData.summary?.totalUsers || 0}</div>
                  <div class="metric-label">Total Users</div>
                </div>
                <div class="metric-card">
                  <div class="metric-value">${gaData.summary?.engagementRate || '0'}%</div>
                  <div class="metric-label">Engagement Rate</div>
                </div>
                <div class="metric-card">
                  <div class="metric-value">${gaData.summary?.conversionRate || '0'}%</div>
                  <div class="metric-label">Conversion Rate</div>
                </div>
              </div>
            </div>

            <!-- Raw Data -->
            <div class="card">
              <h2>🔍 Raw Data Preview</h2>
              <p>Complete data structure returned from Google Analytics API:</p>
              <div class="data-section">
                <pre>${JSON.stringify(gaData, null, 2)}</pre>
              </div>
            </div>

            <!-- Test Different Date Ranges -->
            <div class="card">
              <h2>🕐 Test Different Periods</h2>
              <div>
                <a href="/api/oauth/ga/test-fetch-page?tenant_id=${tenant_id}&report_config_id=${report_config_id}&date_range=7daysAgo" class="btn">
                  Last 7 Days
                </a>
                <a href="/api/oauth/ga/test-fetch-page?tenant_id=${tenant_id}&report_config_id=${report_config_id}&date_range=30daysAgo" class="btn">
                  Last 30 Days
                </a>
                <a href="/api/oauth/ga/test-fetch-page?tenant_id=${tenant_id}&report_config_id=${report_config_id}&date_range=90daysAgo" class="btn">
                  Last 90 Days
                </a>
              </div>
            </div>

            <!-- Navigation -->
            <div class="card">
              <h2>🧭 Next Steps</h2>
              <div>
                <a href="/api/oauth/ga/test-complete?tenant_id=${tenant_id}&report_config_id=${report_config_id}" class="btn">
                  Back to Test Suite
                </a>
                <a href="/api/oauth/ga/status?tenant_id=${tenant_id}&report_config_id=${report_config_id}" class="btn">
                  Check Status
                </a>
                <a href="/api/reporter/test" class="btn" style="background: #27ae60;">
                  Test Full Reporter
                </a>
              </div>
            </div>

            <!-- API Response Info -->
            <div class="card">
              <h2>ℹ️ Response Information</h2>
              <div class="data-section">
                <p><strong>Date Range:</strong> ${date_range} to today</p>
                <p><strong>Property ID:</strong> ${gaData.propertyId || 'N/A'}</p>
                <p><strong>Fetched At:</strong> ${gaData.fetchedAt || new Date().toISOString()}</p>
                <p><strong>Data Points:</strong> ${Object.keys(gaData).length} categories</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `);

  } catch (error) {
    console.error('❌ GA data test page failed:', error);
    res.send(`
      <html>
        <head>
          <title>ReportFlow - Data Fetch Failed</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; text-align: center; background: #f5f5f5; }
            .card { background: white; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 500px; margin: 0 auto; }
            .error { color: #e74c3c; font-size: 48px; margin-bottom: 20px; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="error">❌</div>
            <h1>Data Fetch Failed</h1>
            <p>We couldn't fetch data from Google Analytics:</p>
            <div style="background: #ffeaea; padding: 15px; border-radius: 5px; margin: 20px 0; text-align: left;">
              <strong>Error:</strong> ${error.message}
            </div>
            <p>Possible reasons:</p>
            <ul style="text-align: left; margin: 20px 0;">
              <li>Google Analytics not properly connected</li>
              <li>Tokens expired or invalid</li>
              <li>No data available for the selected period</li>
              <li>Property permissions issue</li>
            </ul>
            <div style="margin-top: 30px;">
              <a href="/api/oauth/ga/test-complete" style="background: #2c5aa0; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 0 10px;">
                Back to Test Suite
              </a>
              <a href="/api/oauth/ga/auth?tenant_id=${req.query.tenant_id}&report_config_id=${req.query.report_config_id}" style="background: #e74c3c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 0 10px;">
                Reconnect GA
              </a>
            </div>
          </div>
        </body>
      </html>
    `);
  }
});

// 🆕 ADVANCED FEATURES TEST PAGE
router.get('/test-advanced', async (req, res) => {
  try {
    const { tenant_id, report_config_id } = req.query;
    
    if (!tenant_id || !report_config_id) {
      return res.status(400).send(`
        <html>
          <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
            <h1 style="color: #e74c3c;">❌ Missing Parameters</h1>
            <p>Required: tenant_id and report_config_id</p>
            <a href="/api/oauth/ga/test-complete" style="color: #2c5aa0;">Go to Test Suite</a>
          </body>
        </html>
      `);
    }

    res.send(`
      <html>
        <head>
          <title>ReportFlow - Advanced Features Test</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; background: #f5f5f5; }
            .card { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin: 20px 0; }
            .feature { background: #f0f7ff; padding: 20px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #2c5aa0; }
            .btn { background: #2c5aa0; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px 5px; }
            .btn-ai { background: #8e44ad; }
            .btn-warning { background: #f39c12; }
          </style>
        </head>
        <body>
          <div style="max-width: 800px; margin: 0 auto;">
            <h1>🧠 Advanced Features Test</h1>
            <p>Revolutionary AI-powered features that nobody else has</p>
            
            <!-- Predictive Analytics -->
            <div class="card">
              <h2>🔮 Predictive Analytics</h2>
              <div class="feature">
                <h3>Revenue Forecasting</h3>
                <p>AI-powered predictions with confidence scores based on historical data.</p>
                <form action="/api/oauth/ga/predictive-insights" method="post" target="_blank">
                  <input type="hidden" name="tenant_id" value="${tenant_id}">
                  <input type="hidden" name="report_config_id" value="${report_config_id}">
                  <input type="hidden" name="periods" value="3">
                  <button type="submit" class="btn btn-ai">Test Predictive Insights</button>
                </form>
              </div>
            </div>

            <!-- Anomaly Detection -->
            <div class="card">
              <h2>⚠️ Anomaly Detection</h2>
              <div class="feature">
                <h3>Automatic Alert System</h3>
                <p>Statistical anomaly detection with severity scoring and recommendations.</p>
                <form action="/api/oauth/ga/detect-anomalies" method="post" target="_blank">
                  <input type="hidden" name="tenant_id" value="${tenant_id}">
                  <input type="hidden" name="report_config_id" value="${report_config_id}">
                  <button type="submit" class="btn btn-warning">Test Anomaly Detection</button>
                </form>
              </div>
            </div>

            <!-- Multi-Property Aggregation -->
            <div class="card">
              <h2>🌐 Multi-Property Data</h2>
              <div class="feature">
                <h3>Cross-Property Analysis</h3>
                <p>Aggregate data from multiple GA properties for unified reporting.</p>
                <p><small>Note: Configure property IDs in your report config sources</small></p>
                <form action="/api/oauth/ga/multi-property" method="post" target="_blank">
                  <input type="hidden" name="tenant_id" value="${tenant_id}">
                  <input type="hidden" name="report_config_id" value="${report_config_id}">
                  <input type="hidden" name="property_ids" value='["property1", "property2"]'>
                  <button type="submit" class="btn">Test Multi-Property</button>
                </form>
              </div>
            </div>

            <!-- Navigation -->
            <div class="card">
              <h2>🧭 Navigation</h2>
              <div>
                <a href="/api/oauth/ga/test-complete?tenant_id=${tenant_id}&report_config_id=${report_config_id}" class="btn">
                  Back to Test Suite
                </a>
                <a href="/api/oauth/ga/test-fetch-page?tenant_id=${tenant_id}&report_config_id=${report_config_id}" class="btn">
                  Basic Data Test
                </a>
              </div>
            </div>
          </div>
        </body>
      </html>
    `);

  } catch (error) {
    console.error('❌ Advanced features test failed:', error);
    res.status(500).send(`
      <html>
        <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
          <h1 style="color: #e74c3c;">❌ Advanced Test Failed</h1>
          <p>Error: ${error.message}</p>
          <a href="/api/oauth/ga/test-complete" style="color: #2c5aa0;">Back to Test Suite</a>
        </body>
      </html>
    `);
  }
});

// ... KEEP ALL EXISTING ENDPOINTS (test-fetch, status, disconnect, predictive-insights, detect-anomalies, multi-property)

// UPDATE EXISTING TEST ENDPOINT TO REDIRECT
router.get('/test', async (req, res) => {
  // Redirect to the comprehensive test suite
  res.redirect('/api/oauth/ga/test-complete');
});

module.exports = router;