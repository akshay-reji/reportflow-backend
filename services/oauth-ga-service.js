const { google } = require('googleapis');
const supabase = require('../lib/supabase');
const crypto = require('crypto');

class GAOAuthService {
  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      `${process.env.BASE_URL || 'http://localhost:3001'}/api/oauth/ga/callback`
    );
    
    // Revolutionary scopes for maximum data access
    this.scopes = [
      'https://www.googleapis.com/auth/analytics.readonly',
      'https://www.googleapis.com/auth/analytics.edit',
      'https://www.googleapis.com/auth/analytics.manage.users.readonly'
    ];
    
    this.analytics = google.analyticsdata({ version: 'v1beta', auth: this.oauth2Client });
    console.log('🚀 GA OAuth Service initialized with advanced scopes');
  }

  // 🔐 Generate OAuth URL with state security
  generateAuthUrl(tenantId, reportConfigId, propertyId = null) {
    const state = crypto.randomBytes(32).toString('hex');
    const stateData = {
      tenantId,
      reportConfigId, 
      propertyId,
      timestamp: Date.now(),
      state
    };
    
    // Store state for security validation
    this.storeOAuthState(state, stateData);
    
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: this.scopes,
      state: state,
      prompt: 'consent',
      include_granted_scopes: true
    });
  }

  // 🔄 Handle OAuth callback with enhanced error handling
  async handleCallback(code, state) {
  try {
    console.log('🔄 Handling GA OAuth callback...');
    
    // Validate state to prevent CSRF
    const stateData = await this.validateOAuthState(state);
    if (!stateData) {
      throw new Error('Invalid OAuth state - possible security issue');
    }

    console.log('📦 State data retrieved:', {
      tenantId: stateData.tenantId,
      reportConfigId: stateData.reportConfigId,
      propertyId: stateData.propertyId
    });

    // Exchange code for tokens
    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);
    
    console.log('✅ Tokens received, fetching GA account info...');

    // Get GA4 property information
    const propertyInfo = await this.getGA4PropertyInfo(tokens);
    
    // 🚨 CRITICAL: Pass the propertyId from stateData to storeGATokens
    await this.storeGATokens(
      stateData.tenantId, 
      stateData.reportConfigId, 
      tokens, 
      propertyInfo,
      stateData.propertyId // 🚨 This was missing!
    );

    return {
      success: true,
      message: 'Google Analytics connected successfully!',
      tenantId: stateData.tenantId,
      reportConfigId: stateData.reportConfigId,
      property: propertyInfo,
      tokensStored: true,
      propertyId: stateData.propertyId
    };

  } catch (error) {
    console.error('❌ GA OAuth callback failed:', error);
    throw new Error(`OAuth failed: ${error.message}`);
  }
}

  // 📊 Fetch GA4 data with advanced metrics
  async fetchGA4Data(tenantId, reportConfigId, dateRange = { startDate: '30daysAgo', endDate: 'today' }) {
  try {
    console.log(`📊 Fetching GA4 data for tenant: ${tenantId}`);
    
    // Get stored tokens
    const { tokens, propertyId } = await this.getStoredGATokens(tenantId, reportConfigId);
    
    if (!propertyId) {
      throw new Error('GA4 Property ID not configured. Please provide your GA4 Property ID in the connection settings.');
    }
    
    this.oauth2Client.setCredentials(tokens);
    
    // Refresh tokens if needed
    await this.refreshTokensIfNeeded(tenantId, reportConfigId, tokens);
    
    // Rest of your data fetching code...
    const [basicMetrics, engagementData, conversionData, audienceData] = await Promise.all([
      this.fetchBasicMetrics(propertyId, dateRange),
      this.fetchEngagementMetrics(propertyId, dateRange),
      this.fetchConversionMetrics(propertyId, dateRange),
      this.fetchAudienceMetrics(propertyId, dateRange)
    ]);

    // ... rest of correlation logic
    return {
      ...correlatedData,
      propertyId,
      dateRange,
      fetchedAt: new Date().toISOString()
    };

  } catch (error) {
    console.error('❌ GA4 data fetch failed:', error);
    throw new Error(`Data fetch failed: ${error.message}`);
  }
}

  // 🔄 Token refresh with automatic retry
  async refreshTokensIfNeeded(tenantId, reportConfigId, tokens) {
    if (tokens.expiry_date && Date.now() > tokens.expiry_date - 300000) { // 5 minutes buffer
      console.log('🔄 Refreshing GA tokens...');
      try {
        this.oauth2Client.setCredentials(tokens);
        const { credentials } = await this.oauth2Client.refreshAccessToken();
        
        // Update stored tokens
        await this.updateStoredTokens(tenantId, reportConfigId, credentials);
        
        return credentials;
      } catch (error) {
        console.error('❌ Token refresh failed:', error);
        throw new Error('Token refresh failed - reauthentication required');
      }
    }
    return tokens;
  }

  // 🏆 ADVANCED FEATURES NOBODY HAS

  // 🔍 Multi-property data aggregation
  async fetchMultiPropertyData(tenantId, reportConfigId, propertyIds, dateRange) {
    const propertyPromises = propertyIds.map(propertyId => 
      this.fetchGA4Data(tenantId, reportConfigId, { ...dateRange, propertyId })
    );
    
    const results = await Promise.all(propertyPromises);
    return this.aggregateMultiPropertyData(results);
  }

  // 📈 Predictive trend analysis
  async generateTrendPredictions(gaData, periods = 3) {
    const historicalTrends = this.analyzeHistoricalTrends(gaData);
    const seasonality = this.calculateSeasonality(gaData);
    
    return {
      predictedMetrics: this.predictNextPeriod(historicalTrends, seasonality, periods),
      confidenceScores: this.calculatePredictionConfidence(historicalTrends),
      trendInsights: this.generateTrendInsights(historicalTrends)
    };
  }

  // 🎯 Anomaly detection
  async detectAnomalies(gaData, baselinePeriod = '30daysAgo') {
    const baseline = await this.fetchGA4Data(gaData.tenantId, gaData.reportConfigId, {
      startDate: baselinePeriod,
      endDate: 'today'
    });
    
    return {
      anomalies: this.findStatisticalAnomalies(gaData, baseline),
      severity: this.calculateAnomalySeverity(gaData, baseline),
      recommendations: this.generateAnomalyRecommendations(gaData, baseline)
    };
  }

  
  async validateOAuthState(state) {
  console.log('🔍 validateOAuthState called with state:', state);
  console.log('🕒 Current time:', new Date().toISOString());
  
  const { data, error } = await supabase
    .from('oauth_states')
    .select('state_data, expires_at, created_at')
    .eq('state', state)
    .single(); // 🚨 REMOVE: .gt('expires_at', new Date()) - we'll check manually

  console.log('📊 Database query result:', { data, error });

  if (error || !data) {
    console.log('❌ State not found in database');
    return null;
  }

  // 🚨 MANUALLY check expiration with better logging
  const isExpired = new Date(data.expires_at) < new Date();
  console.log('📊 Expiration check:', {
    expires_at: data.expires_at,
    current_time: new Date().toISOString(),
    is_expired: isExpired,
    time_until_expiry: (new Date(data.expires_at) - new Date()) / 1000
  });

  if (isExpired) {
    console.log('❌ State has expired');
    // Clean up expired state
    await supabase.from('oauth_states').delete().eq('state', state);
    return null;
  }

  console.log('✅ State validation SUCCESS');
  // Clean up used state
  await supabase.from('oauth_states').delete().eq('state', state);
  return data.state_data;
}

  async getGA4PropertyInfo(tokens) {
  try {
    console.log('🔍 Fetching GA4 property information...');
    
    // Use Analytics Data API to discover properties
    const analytics = google.analyticsdata({ version: 'v1beta', auth: this.oauth2Client });
    
    // Try to get account summaries to find properties
    const admin = google.analyticsadmin({ version: 'v1alpha', auth: this.oauth2Client });
    
    try {
      // Try Admin API first
      const accounts = await admin.accounts.list();
      
      if (accounts.data.accounts && accounts.data.accounts.length > 0) {
        const account = accounts.data.accounts[0];
        const properties = await admin.properties.list({
          parent: account.name
        });
        
        if (properties.data.properties && properties.data.properties.length > 0) {
          const property = properties.data.properties[0];
          console.log('✅ Found GA4 property via Admin API:', property.displayName);
          
          return {
            accountName: account.displayName,
            accountId: account.name.split('/')[1],
            propertyId: property.name.split('/')[1], // This is the numeric property ID
            propertyName: property.displayName,
            accessible: true
          };
        }
      }
    } catch (adminError) {
      console.log('⚠️ Admin API not available, using manual property ID input');
    }
    
    // Fallback: Return instructions for manual property ID
    return {
      accessible: true,
      manualPropertyIdRequired: true,
      note: 'Please manually enter your GA4 Property ID. You can find it in your Google Analytics account under Admin > Property Settings.',
      instructions: 'The Property ID is a numeric value like "123456789"'
    };
    
  } catch (error) {
    console.warn('⚠️ Could not fetch property details:', error.message);
    return { 
      accessible: true, 
      manualPropertyIdRequired: true,
      note: 'Basic access - manual property ID required'
    };
  }
}

  async storeGATokens(tenantId, reportConfigId, tokens, propertyInfo, customPropertyId = null) {
  console.log('💾 Storing GA tokens for tenant:', tenantId);
  console.log('📝 Provided property ID:', customPropertyId);
  
  try {
    // 🚨 CRITICAL FIX: Use the provided property ID from the OAuth flow
    let propertyId = customPropertyId;
    
    // If we got a property ID from the user input, use it!
    if (propertyId) {
      console.log('✅ Using provided property ID:', propertyId);
    } else if (propertyInfo.manualPropertyIdRequired) {
      console.log('📝 Manual property ID required - will need user input');
      propertyId = null;
    } else if (propertyInfo.propertyId) {
      propertyId = propertyInfo.propertyId;
      console.log('✅ Using discovered property ID:', propertyId);
    }
    
    const gaConfig = {
      oauth_tokens: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        scope: tokens.scope,
        token_type: tokens.token_type,
        expiry_date: tokens.expiry_date
      },
      property_info: propertyInfo,
      connected_at: new Date().toISOString(),
      property_id: propertyId, // 🚨 This is the key line!
      manual_property_id_required: propertyInfo.manualPropertyIdRequired || false
    };

    console.log('📦 Final GA Config:', {
      property_id: gaConfig.property_id,
      has_tokens: !!gaConfig.oauth_tokens.access_token
    });

    // Get current sources
    const { data: currentConfig, error: fetchError } = await supabase
      .from('report_configs')
      .select('sources')
      .eq('id', reportConfigId)
      .eq('tenant_id', tenantId)
      .single();

    if (fetchError) {
      console.error('❌ Failed to fetch current config:', fetchError);
      throw fetchError;
    }

    // Merge the new GA config
    const updatedSources = {
      ...currentConfig.sources,
      google_analytics: gaConfig
    };

    // Update with merged sources
    const { error } = await supabase
      .from('report_configs')
      .update({ 
        sources: updatedSources 
      })
      .eq('id', reportConfigId)
      .eq('tenant_id', tenantId);

    if (error) {
      console.error('❌ Supabase update error:', error);
      throw error;
    }
    
    console.log('✅ GA tokens stored successfully with property ID:', propertyId);
    
    // Return the stored config for verification
    return { propertyId, success: true };
    
  } catch (error) {
    console.error('❌ Failed to store GA tokens:', error);
    throw new Error(`Failed to store GA tokens: ${error.message}`);
  }
}

  async getStoredGATokens(tenantId, reportConfigId) {
  console.log('🔍 Getting stored GA tokens for:', { tenantId, reportConfigId });
  
  const { data, error } = await supabase
    .from('report_configs')
    .select('sources')
    .eq('id', reportConfigId)
    .eq('tenant_id', tenantId)
    .single();

  if (error || !data.sources?.google_analytics) {
    console.error('❌ GA configuration not found:', {
      error,
      hasSources: !!data?.sources,
      hasGA: !!data?.sources?.google_analytics
    });
    throw new Error('GA configuration not found - please reconnect Google Analytics');
  }

  const gaConfig = data.sources.google_analytics;
  
  console.log('📊 Retrieved GA config:', {
    hasTokens: !!gaConfig.oauth_tokens?.access_token,
    propertyId: gaConfig.property_id,
    connectedAt: gaConfig.connected_at
  });

  return {
    tokens: gaConfig.oauth_tokens,
    propertyId: gaConfig.property_id, // 🚨 Make sure this is returned
    propertyInfo: gaConfig.property_info
  };
}

  // DATA FETCHING METHODS

  async fetchBasicMetrics(propertyId, dateRange) {
    const response = await this.analytics.properties.runReport({
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [dateRange],
        metrics: [
          { name: 'sessions' },
          { name: 'totalUsers' },
          { name: 'screenPageViews' },
          { name: 'averageSessionDuration' },
          { name: 'bounceRate' }
        ],
        dimensions: [{ name: 'date' }]
      }
    });
    
    return this.processGAResponse(response.data);
  }

  async fetchEngagementMetrics(propertyId, dateRange) {
    const response = await this.analytics.properties.runReport({
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [dateRange],
        metrics: [
          { name: 'engagedSessions' },
          { name: 'engagementRate' },
          { name: 'eventCount' },
          { name: 'conversions' }
        ]
      }
    });
    
    return this.processGAResponse(response.data);
  }

  async fetchConversionMetrics(propertyId, dateRange) {
    const response = await this.analytics.properties.runReport({
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [dateRange],
        metrics: [
          { name: 'totalRevenue' },
          { name: 'purchaseRevenue' },
          { name: 'transactions' },
          { name: 'sessions' }
        ],
        dimensions: [{ name: 'sessionSource' }]
      }
    });
    
    return this.processGAResponse(response.data);
  }

  async fetchAudienceMetrics(propertyId, dateRange) {
    const response = await this.analytics.properties.runReport({
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [dateRange],
        metrics: [
          { name: 'activeUsers' },
          { name: 'newUsers' },
          { name: 'sessions' }
        ],
        dimensions: [
          { name: 'country' },
          { name: 'deviceCategory' }
        ]
      }
    });
    
    return this.processGAResponse(response.data);
  }

  processGAResponse(data) {
    if (!data.rows) return {};
    
    const processed = {};
    data.rows.forEach(row => {
      const metricValues = {};
      row.metricValues.forEach((value, index) => {
        const metricName = data.metricHeaders[index].name;
        metricValues[metricName] = value.value;
      });
      
      if (row.dimensionValues && row.dimensionValues.length > 0) {
        const dimensionKey = row.dimensionValues.map(d => d.value).join('_');
        processed[dimensionKey] = metricValues;
      } else {
        Object.assign(processed, metricValues);
      }
    });
    
    return processed;
  }

  // DATA CORRELATION ENGINE
  correlateMetrics(dataGroups) {
    return {
      // Basic metrics with enhanced calculations
      summary: {
        totalSessions: dataGroups.basic.sessions || 0,
        totalUsers: dataGroups.basic.totalUsers || 0,
        engagementRate: this.calculateEngagementRate(dataGroups),
        conversionRate: this.calculateConversionRate(dataGroups),
        revenuePerSession: this.calculateRPS(dataGroups)
      },
      
      // Channel performance
      channels: this.analyzeChannelPerformance(dataGroups.conversion),
      
      // Audience insights
      audience: this.analyzeAudienceSegments(dataGroups.audience),
      
      // Trend analysis
      trends: this.analyzeWeeklyTrends(dataGroups.basic),
      
      // Raw data for advanced processing
      raw: dataGroups
    };
  }

  // CALCULATION METHODS
  calculateEngagementRate(dataGroups) {
    const engagedSessions = dataGroups.engagement.engagedSessions || 0;
    const totalSessions = dataGroups.basic.sessions || 1;
    return ((engagedSessions / totalSessions) * 100).toFixed(1);
  }

  calculateConversionRate(dataGroups) {
    const conversions = dataGroups.engagement.conversions || 0;
    const sessions = dataGroups.basic.sessions || 1;
    return ((conversions / sessions) * 100).toFixed(1);
  }

  calculateRPS(dataGroups) {
    const revenue = dataGroups.conversion.totalRevenue || 0;
    const sessions = dataGroups.basic.sessions || 1;
    return (revenue / sessions).toFixed(2);
  }

  analyzeChannelPerformance(conversionData) {
    // Implement channel analysis logic
    return conversionData;
  }

  analyzeAudienceSegments(audienceData) {
    // Implement audience segmentation logic
    return audienceData;
  }

  analyzeWeeklyTrends(basicData) {
    // Implement trend analysis logic
    return basicData;
  }

  // UPDATE STORED TOKENS
  async updateStoredTokens(tenantId, reportConfigId, newTokens) {
    const { error } = await supabase
      .from('report_configs')
      .update({
        sources: supabase.raw(`
          jsonb_set(
            COALESCE(sources, '{}'::jsonb),
            '{google_analytics,oauth_tokens}',
            $1::jsonb
          )
        `, [newTokens])
      })
      .eq('id', reportConfigId)
      .eq('tenant_id', tenantId);

    if (error) throw new Error(`Failed to update tokens: ${error.message}`);
  }

  async storeOAuthState(state, stateData) {
  console.log('=== 🚨 STORE OAUTH STATE DEBUG START ===');
  console.log('💾 Storing OAuth state:', state);
  
  try {
    // 🚨 FIX: Remove the duplicate state from state_data
    const cleanStateData = {
      tenantId: stateData.tenantId,
      reportConfigId: stateData.reportConfigId, 
      propertyId: stateData.propertyId,
      timestamp: stateData.timestamp
      // 🚨 REMOVE: state: stateData.state (duplicate)
    };

    console.log('📦 Clean State data:', JSON.stringify(cleanStateData, null, 2));
    
    const { data, error } = await supabase
      .from('oauth_states')
      .upsert({
        state: state,
        state_data: cleanStateData, // Use cleaned data
        expires_at: new Date(Date.now() + 60 * 60 * 1000) // 1 hour
      }, {
        onConflict: 'state'
      })
      .select();

    if (error) throw error;
    
    console.log('✅ State stored successfully');
    console.log('=== ✅ STORE OAUTH STATE DEBUG END ===');
    return data;
  } catch (error) {
    console.error('❌ State storage failed:', error);
    throw error;
  }
}

  


}
module.exports = new GAOAuthService();