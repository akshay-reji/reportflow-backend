// routes/ai-insights.js
const express = require('express');
const router = express.Router();
const aiInsightsService = require('../services/ai-insights-service');
const gaOAuthService = require('../services/oauth-ga-service');
const supabase = require('../lib/supabase');
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

// 🧠 GET PREDICTIVE INSIGHTS
router.post('/predictive', verifyWebhook, async (req, res) => {
  try {
    const { tenant_id, report_config_id, periods = 3 } = req.body;
    
    if (!tenant_id || !report_config_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing tenant_id or report_config_id' 
      });
    }

    console.log(`🔮 Generating predictive insights for tenant: ${tenant_id}`);

    // Fetch GA data first
    const gaData = await gaOAuthService.fetchGA4Data(
      tenant_id, 
      report_config_id, 
      { startDate: '90daysAgo', endDate: 'today' }
    );

    // Generate predictive insights
    const insights = await aiInsightsService.generatePredictiveInsights(gaData, null, periods);

    // Store insights in database
    if (insights.success) {
     await storeAIInsights(tenant_id, report_config_id, 'predictive', insights);
     }

    res.json({
      success: true,
      message: 'Predictive insights generated successfully!',
      ...insights
    });

  } catch (error) {
    console.error('❌ Predictive insights route failed:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ⚠️ DETECT ANOMALIES
router.post('/anomalies', verifyWebhook, async (req, res) => {
  try {
    const { tenant_id, report_config_id, baseline_period = '30daysAgo' } = req.body;
    
    if (!tenant_id || !report_config_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing tenant_id or report_config_id' 
      });
    }

    console.log(`⚠️ Running anomaly detection for tenant: ${tenant_id}`);

    // Fetch current GA data
    const currentData = await gaOAuthService.fetchGA4Data(
      tenant_id, 
      report_config_id, 
      { startDate: '7daysAgo', endDate: 'today' }
    );

    // Detect anomalies
    const anomalies = await aiInsightsService.detectAnomalies(currentData, baseline_period);

    // Store anomaly results
    if (anomalies.success) {
        await storeAIInsights(tenant_id, report_config_id, 'anomaly', anomalies);
     }

    res.json({
      success: true,
      message: anomalies.anomalies.length > 0 ? 'Anomalies detected!' : 'No significant anomalies found',
      ...anomalies
    });

  } catch (error) {
    console.error('❌ Anomaly detection route failed:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 📊 COMPETITIVE BENCHMARKING
router.post('/benchmarking', verifyWebhook, async (req, res) => {
  try {
    const { tenant_id, report_config_id, industry = 'digital_agency' } = req.body;
    
    if (!tenant_id || !report_config_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing tenant_id or report_config_id' 
      });
    }

    console.log(`📊 Generating competitive benchmarks for tenant: ${tenant_id}`);

    // Fetch GA data
    const gaData = await gaOAuthService.fetchGA4Data(
      tenant_id, 
      report_config_id, 
      { startDate: '30daysAgo', endDate: 'today' }
    );

    // Generate competitive benchmarking
    const benchmarking = await aiInsightsService.generateCompetitiveBenchmarking(gaData, industry);

    // Store benchmarking results
    if (benchmarking.success) {
      await storeAIInsights(tenant_id, report_config_id, 'benchmarking', benchmarking);
    }

    res.json({
      success: true,
      message: 'Competitive benchmarking completed!',
      ...benchmarking
    });

  } catch (error) {
    console.error('❌ Competitive benchmarking route failed:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 🌐 CROSS-PLATFORM INSIGHTS
router.post('/cross-platform', verifyWebhook, async (req, res) => {
  try {
    const { tenant_id, report_config_id } = req.body;
    
    if (!tenant_id || !report_config_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing tenant_id or report_config_id' 
      });
    }

    console.log(`🌐 Generating cross-platform insights for tenant: ${tenant_id}`);

    // Fetch GA data
    const gaData = await gaOAuthService.fetchGA4Data(
      tenant_id, 
      report_config_id, 
      { startDate: '30daysAgo', endDate: 'today' }
    );

    // Note: Meta data would be fetched here when Meta OAuth is implemented
    const metaData = null; // Placeholder for future Meta integration

    // Generate cross-platform insights
    const crossPlatformInsights = await aiInsightsService.correlateMultiPlatformData(gaData, metaData);

    res.json({
      success: true,
      message: 'Cross-platform insights generated!',
      insights: crossPlatformInsights,
      note: metaData ? 'Full cross-platform analysis completed' : 'GA-only analysis (Meta integration pending)'
    });

  } catch (error) {
    console.error('❌ Cross-platform insights route failed:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 🎯 COMPREHENSIVE AI REPORT
router.post('/comprehensive', verifyWebhook, async (req, res) => {
  try {
    const { tenant_id, report_config_id, industry = 'digital_agency' } = req.body;
    
    if (!tenant_id || !report_config_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing tenant_id or report_config_id' 
      });
    }

    console.log(`🎯 Generating comprehensive AI report for tenant: ${tenant_id}`);

    // Fetch GA data
    const gaData = await gaOAuthService.fetchGA4Data(
      tenant_id, 
      report_config_id, 
      { startDate: '90daysAgo', endDate: 'today' }
    );

    // Generate all AI insights
    const [predictive, anomalies, benchmarking] = await Promise.all([
      aiInsightsService.generatePredictiveInsights(gaData, null, 3),
      aiInsightsService.detectAnomalies(gaData),
      aiInsightsService.generateCompetitiveBenchmarking(gaData, industry)
    ]);

    // Compile comprehensive report
    const comprehensiveReport = {
      success: predictive.success && anomalies.success && benchmarking.success,
      executive_summary: generateExecutiveSummary(predictive, anomalies, benchmarking),
      predictive_analytics: predictive,
      anomaly_detection: anomalies,
      competitive_benchmarking: benchmarking,
      strategic_recommendations: generateStrategicRecommendations(predictive, anomalies, benchmarking),
      generated_at: new Date().toISOString()
    };

    // Store comprehensive report
    if (comprehensiveReport.success) {
      await storeAIInsights(tenant_id, report_config_id, 'comprehensive', comprehensiveReport);
    }

    res.json({
      success: true,
      message: 'Comprehensive AI report generated successfully!',
      report: comprehensiveReport
    });

  } catch (error) {
    console.error('❌ Comprehensive AI report failed:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 🧪 TEST ENDPOINT (Unprotected for development)
router.post('/test', async (req, res) => {
  try {
    // Use existing test data
    const testTenantId = '3bce31b7-b045-4da0-981c-db138e866cfe';
    const testConfigId = 'e51bc18e-a9f4-4501-a33f-6b478b689289';
    
    console.log('🧪 Testing AI Insights with sample data');

    // Test predictive insights
    const mockGAData = {
      summary: {
        totalSessions: 15432,
        totalUsers: 12456,
        engagementRate: 58.7,
        conversionRate: 2.8,
        avgSessionDuration: 165
      },
      raw: {
        conversion: {
          totalRevenue: 45218
        }
      }
    };

    const insights = await aiInsightsService.generatePredictiveInsights(mockGAData, null, 3);
    
    res.json({
      success: true,
      message: 'AI Insights test completed!',
      test_insights: insights,
      note: 'This was a test with mock data. Use real endpoints with tenant_id and report_config_id for production data.'
    });

  } catch (error) {
    console.error('❌ AI Insights test failed:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 📊 GET STORED INSIGHTS
router.get('/stored', verifyWebhook, async (req, res) => {
  try {
    const { tenant_id, report_config_id, insight_type, limit = 10 } = req.query;
    
    if (!tenant_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing tenant_id' 
      });
    }

    let query = supabase
      .from('ai_insights')
      .select('*')
      .eq('tenant_id', tenant_id)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (report_config_id) {
      query = query.eq('report_config_id', report_config_id);
    }

    if (insight_type) {
      query = query.eq('insight_type', insight_type);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({
      success: true,
      insights: data,
      count: data.length
    });

  } catch (error) {
    console.error('❌ Failed to fetch stored insights:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 🔧 HELPER METHODS

// Store AI insights in database
async function storeAIInsights(tenantId, reportConfigId, insightType, insightData) {
  try {
    const confidence = calculateOverallConfidence(insightData);
    const { error } = await supabase
      .from('ai_insights')
      .insert({
        tenant_id: tenantId,
        report_config_id: reportConfigId,
        insight_type: insightType,
        insight_text: JSON.stringify(insightData),
        confidence_score: confidence,
        recommended_actions: insightData.recommendations || []
      });

    if (error) {
      console.error('❌ Failed to store AI insights:', error);
    } else {
      console.log('✅ AI insights stored successfully');
    }
  } catch (error) {
    console.error('❌ AI insights storage failed:', error);
  }
}


// Calculate overall confidence score
function calculateOverallConfidence(insightData) {
  if (insightData.confidence_scores) {
    const scores = Object.values(insightData.confidence_scores);
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }
  return 0.8; // Default confidence
}

// Generate executive summary
function generateExecutiveSummary(predictive, anomalies, benchmarking) {
  const summaries = [];
  
  if (predictive.success) {
    const revenueTrend = predictive.predictions.revenue_forecast[0]?.trend_direction;
    summaries.push(`Revenue trend: ${revenueTrend === 'up' ? 'Growing' : 'Declining'}`);
  }
  
  if (anomalies.success && anomalies.anomalies.length > 0) {
    summaries.push(`${anomalies.anomalies.length} anomalies detected requiring attention`);
  }
  
  if (benchmarking.success) {
    summaries.push(`Market position: ${benchmarking.benchmarking.market_position}`);
  }
  
  return summaries.length > 0 ? summaries : ['Performance analysis completed successfully'];
}

// Generate strategic recommendations
function generateStrategicRecommendations(predictive, anomalies, benchmarking) {
  const recommendations = [];

  if (predictive && Array.isArray(predictive.recommendations)) {
    recommendations.push(...predictive.recommendations);
  }

  if (anomalies && Array.isArray(anomalies.recommendations)) {
    recommendations.push(...anomalies.recommendations);
  }

  if (benchmarking?.benchmarking?.opportunity_analysis) {
    benchmarking.benchmarking.opportunity_analysis.forEach(opp => {
      recommendations.push(`Focus on improving ${opp.metric} to gain competitive advantage`);
    });
  }

  return recommendations.slice(0, 5); // top 5
}


// GET test page for browser testing
router.get('/test', async (req, res) => {
  res.send(`
    <html>
      <head>
        <title>ReportFlow - AI Insights Test</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; background: #f5f5f5; }
          .card { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin: 20px 0; }
          .btn { background: #2c5aa0; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px 5px; }
          .btn-ai { background: #8e44ad; }
        </style>
      </head>
      <body>
        <div style="max-width: 800px; margin: 0 auto;">
          <h1>🧠 AI Insights Engine Test</h1>
          <p>Test the revolutionary AI-powered features that nobody else has!</p>
          
          <div class="card">
            <h2>🚀 Test Revolutionary Features</h2>
            <p>Click the buttons below to test different AI insights features:</p>
            
            <div style="margin: 20px 0;">
              <a href="/api/ai-insights/test-complete" class="btn btn-ai">
                Comprehensive Test Suite
              </a>
              <a href="/api/oauth/ga/test-complete" class="btn">
                Back to GA Test Suite
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  `);
});

// 🏆 COMPREHENSIVE TEST SUITE FOR AI INSIGHTS
router.get('/test-complete', async (req, res) => {
  try {
    const testTenantId = req.query.tenant_id || '3bce31b7-b045-4da0-981c-db138e866cfe';
    const testConfigId = req.query.report_config_id || 'e51bc18e-a9f4-4501-a33f-6b478b689289';
    
    res.send(`
      <html>
        <head>
          <title>ReportFlow - AI Insights Test Suite</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; background: #f5f5f5; }
            .card { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin: 20px 0; }
            .feature { background: #f0f7ff; padding: 20px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #8e44ad; }
            .btn { background: #2c5aa0; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px 5px; }
            .btn-ai { background: #8e44ad; }
            .btn-success { background: #27ae60; }
            .form-group { margin: 15px 0; }
            label { display: block; margin-bottom: 5px; font-weight: bold; }
            input, select { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px; }
          </style>
        </head>
        <body>
          <div style="max-width: 1000px; margin: 0 auto;">
            <h1>🧠 AI Insights Revolution - Test Suite</h1>
            <p>Experience the revolutionary AI-powered features that will dominate the market!</p>
            
            <!-- Configuration -->
            <div class="card">
              <h2>🔧 Test Configuration</h2>
              <form action="/api/ai-insights/test-complete" method="get">
                <div class="form-group">
                  <label for="tenant_id">Tenant ID:</label>
                  <input type="text" id="tenant_id" name="tenant_id" value="${testTenantId}" required>
                </div>
                <div class="form-group">
                  <label for="report_config_id">Report Config ID:</label>
                  <input type="text" id="report_config_id" name="report_config_id" value="${testConfigId}" required>
                </div>
                <button type="submit" class="btn">Update Test Configuration</button>
              </form>
            </div>

            <!-- Revolutionary Features -->
            <div class="card">
              <h2>🚀 Revolutionary AI Features</h2>
              
              <div class="feature">
                <h3>🔮 Predictive Analytics</h3>
                <p>AI-powered revenue forecasting and trend predictions with confidence scores.</p>
                <form action="/api/ai-insights/predictive" method="post" target="_blank">
                  <input type="hidden" name="tenant_id" value="${testTenantId}">
                  <input type="hidden" name="report_config_id" value="${testConfigId}">
                  <input type="hidden" name="periods" value="3">
                  <button type="submit" class="btn btn-ai">Test Predictive Insights</button>
                </form>
              </div>

              <div class="feature">
                <h3>⚠️ Anomaly Detection</h3>
                <p>Statistical anomaly detection with automatic alerts and recommendations.</p>
                <form action="/api/ai-insights/anomalies" method="post" target="_blank">
                  <input type="hidden" name="tenant_id" value="${testTenantId}">
                  <input type="hidden" name="report_config_id" value="${testConfigId}">
                  <button type="submit" class="btn btn-ai">Test Anomaly Detection</button>
                </form>
              </div>

              <div class="feature">
                <h3>📊 Competitive Benchmarking</h3>
                <p>Compare performance against industry standards and identify opportunities.</p>
                <form action="/api/ai-insights/benchmarking" method="post" target="_blank">
                  <input type="hidden" name="tenant_id" value="${testTenantId}">
                  <input type="hidden" name="report_config_id" value="${testConfigId}">
                  <input type="hidden" name="industry" value="digital_agency">
                  <button type="submit" class="btn btn-ai">Test Competitive Benchmarking</button>
                </form>
              </div>

              <div class="feature">
                <h3>🎯 Comprehensive AI Report</h3>
                <p>Complete AI-powered analysis with executive summary and strategic recommendations.</p>
                <form action="/api/ai-insights/comprehensive" method="post" target="_blank">
                  <input type="hidden" name="tenant_id" value="${testTenantId}">
                  <input type="hidden" name="report_config_id" value="${testConfigId}">
                  <button type="submit" class="btn btn-success">Generate Full AI Report</button>
                </form>
              </div>
            </div>

            <!-- API Documentation -->
            <div class="card">
              <h2>📚 AI Insights API Endpoints</h2>
              <div style="background: #f8f9fa; padding: 20px; border-radius: 5px;">
                <h4>Available Endpoints:</h4>
                <ul>
                  <li><strong>POST /predictive</strong> - Predictive analytics and forecasting</li>
                  <li><strong>POST /anomalies</strong> - Statistical anomaly detection</li>
                  <li><strong>POST /benchmarking</strong> - Competitive benchmarking</li>
                  <li><strong>POST /cross-platform</strong> - Multi-platform data correlation</li>
                  <li><strong>POST /comprehensive</strong> - Complete AI analysis report</li>
                  <li><strong>GET /stored</strong> - Retrieve stored insights</li>
                  <li><strong>POST /test</strong> - Test endpoint with mock data</li>
                </ul>
              </div>
            </div>

            <!-- Navigation -->
            <div class="card">
              <h2>🧭 Navigation</h2>
              <div>
                <a href="/api/oauth/ga/test-complete" class="btn">Back to GA Test Suite</a>
                <a href="/api/health" class="btn">System Health</a>
                <a href="/api/reporter/test" class="btn">Test Reporter</a>
              </div>
            </div>
          </div>
        </body>
      </html>
    `);

  } catch (error) {
    console.error('❌ AI Insights test suite failed:', error);
    res.status(500).send(`
      <html>
        <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
          <h1 style="color: #e74c3c;">❌ AI Test Suite Error</h1>
          <p>Error: ${error.message}</p>
          <a href="/api/ai-insights/test-complete" style="color: #2c5aa0;">Try Again</a>
        </body>
      </html>
    `);
  }
});

module.exports = router;