// services/oauth-meta-service.js - MANUAL TOKEN VERSION
const supabase = require('../lib/supabase');

class MetaOAuthService {
  constructor() {
    // We are using manual tokens, so we don't initialize an OAuth client.
    // The App ID/Secret might be needed for future advanced flows but not for basic token validation.
    console.log('🚀 Meta Service Initialized - Manual Token Flow');
  }

  // 🎯 CORE METHOD 1: Store and Validate a Manual Token
  async storeManualToken(tenantId, reportConfigId, accessToken, adAccountId) {
    try {
      console.log(`💾 Storing manual Meta token for tenant: ${tenantId}`);

      // 1. Validate the token by making a test API call
      const isValid = await this.validateAccessToken(accessToken, adAccountId);
      if (!isValid) {
        throw new Error('Invalid access token or ad account ID. Please check your credentials.');
      }

      // 2. Prepare the configuration object
      const metaConfig = {
        oauth_tokens: {
          access_token: accessToken,
          token_type: 'manual_user_token',
          stored_at: new Date().toISOString(),
          // Calculate expiry ~60 days from now for tracking
          expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        },
        ad_account_id: adAccountId,
        connected_at: new Date().toISOString(),
        connection_type: 'manual_token'
      };

      // 3. Get current sources from the report config
      const { data: currentConfig, error: fetchError } = await supabase
        .from('report_configs')
        .select('sources')
        .eq('id', reportConfigId)
        .eq('tenant_id', tenantId)
        .single();

      if (fetchError) throw fetchError;

      // 4. Merge the new Meta config into existing sources
      const updatedSources = {
        ...currentConfig.sources,
        meta_ads: metaConfig
      };

      // 5. Update the database
      const { error } = await supabase
        .from('report_configs')
        .update({ sources: updatedSources })
        .eq('id', reportConfigId)
        .eq('tenant_id', tenantId);

      if (error) throw error;

      console.log('✅ Manual Meta token stored successfully');
      return {
        success: true,
        message: 'Meta Ads connected successfully with manual token!',
        ad_account_id: adAccountId
      };

    } catch (error) {
      console.error('❌ Manual token storage failed:', error);
      throw new Error(`Failed to connect: ${error.message}`);
    }
  }

  // 🎯 CORE METHOD 2: Validate Token by Calling Meta API
  async validateAccessToken(accessToken, adAccountId) {
    try {
      console.log('🔍 Validating Meta access token...');
      // A simple API call to verify the token works for the specified account
      const testUrl = `https://graph.facebook.com/v17.0/${adAccountId}?access_token=${accessToken}&fields=name,account_status`;
      const response = await fetch(testUrl);
      const data = await response.json();

      if (data.error) {
        console.error('❌ Token validation failed:', data.error.message);
        return false;
      }
      console.log(`✅ Token validated for account: ${data.name} (Status: ${data.account_status})`);
      return true;
    } catch (error) {
      console.error('❌ Token validation network error:', error.message);
      return false;
    }
  }

  // 🎯 CORE METHOD 3: Fetch Data (Uses Real or Mock)
  async fetchMetaAdsData(tenantId, reportConfigId, dateRange = { since: '30 days ago', until: 'today' }) {
    try {
      console.log(`📱 Fetching Meta Ads data for tenant: ${tenantId}`);
      const { tokens, adAccountId } = await this.getStoredMetaTokens(tenantId, reportConfigId);

      // If we have a valid manual token, fetch real data
      if (tokens && tokens.access_token) {
        console.log('🔑 Using stored manual token for real data.');
        return await this.fetchRealMetaData(adAccountId, tokens.access_token, dateRange);
      } else {
        // Otherwise, use enhanced mock data (for development)
        console.log('📱 Using enhanced mock data (no valid token found).');
        return await this.getEnhancedMockData();
      }

    } catch (error) {
      console.error('❌ Meta data fetch failed:', error.message);
      // Fallback to mock data on any error to keep the report flow working
      return await this.getEnhancedMockData();
    }
  }

  // 🎯 HELPER: Get tokens from database
  async getStoredMetaTokens(tenantId, reportConfigId) {
    const { data, error } = await supabase
      .from('report_configs')
      .select('sources')
      .eq('id', reportConfigId)
      .eq('tenant_id', tenantId)
      .single();

    if (error || !data.sources?.meta_ads) {
      throw new Error('Meta configuration not found.');
    }

    const metaConfig = data.sources.meta_ads;
    return {
      tokens: metaConfig.oauth_tokens,
      adAccountId: metaConfig.ad_account_id,
      connectionType: metaConfig.connection_type
    };
  }

  // --- REAL DATA FETCHING METHODS (Only called if a token exists) ---
  async fetchRealMetaData(adAccountId, accessToken, dateRange) {
    try {
      // Fetch key data points in parallel for performance
      const [accountData, campaignInsights] = await Promise.all([
        this.fetchAdAccountData(adAccountId, accessToken),
        this.fetchCampaignInsights(adAccountId, accessToken, dateRange)
      ]);

      return {
        account_overview: {
          account_name: accountData.name,
          account_status: accountData.account_status,
          amount_spent: accountData.amount_spent,
          currency: accountData.currency
        },
        campaign_performance: this.processCampaignData(campaignInsights),
        key_metrics: this.calculateMetaMetrics(campaignInsights),
        date_range: dateRange,
        fetched_at: new Date().toISOString(),
        data_quality: 'REAL_META_DATA'
      };
    } catch (error) {
      console.error('❌ Real Meta data fetch failed:', error);
      throw error; // Re-throw to be caught by the caller
    }
  }

  async fetchAdAccountData(adAccountId, accessToken) {
    const url = `https://graph.facebook.com/v17.0/${adAccountId}?access_token=${accessToken}&fields=name,account_status,amount_spent,currency`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.error) throw new Error(`Meta API (Account): ${data.error.message}`);
    return data;
  }

  async fetchCampaignInsights(adAccountId, accessToken, dateRange) {
    const url = `https://graph.facebook.com/v17.0/${adAccountId}/insights?access_token=${accessToken}&fields=campaign_name,impressions,clicks,spend,conversions&time_range={'since':'${dateRange.since}','until':'${dateRange.until}'}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.error) throw new Error(`Meta API (Insights): ${data.error.message}`);
    return data.data || [];
  }

  processCampaignData(campaignInsights) {
    return campaignInsights.map(campaign => ({
      name: campaign.campaign_name,
      impressions: parseInt(campaign.impressions) || 0,
      clicks: parseInt(campaign.clicks) || 0,
      spend: parseFloat(campaign.spend) || 0,
      conversions: parseInt(campaign.conversions) || 0,
    }));
  }

  calculateMetaMetrics(campaignInsights) {
    const totals = campaignInsights.reduce((acc, campaign) => ({
      impressions: acc.impressions + (parseInt(campaign.impressions) || 0),
      clicks: acc.clicks + (parseInt(campaign.clicks) || 0),
      spend: acc.spend + (parseFloat(campaign.spend) || 0),
      conversions: acc.conversions + (parseInt(campaign.conversions) || 0)
    }), { impressions: 0, clicks: 0, spend: 0, conversions: 0 });

    return {
      total_impressions: totals.impressions,
      total_clicks: totals.clicks,
      total_spend: totals.spend,
      total_conversions: totals.conversions,
      overall_ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
      cost_per_conversion: totals.conversions > 0 ? totals.spend / totals.conversions : 0,
    };
  }

  // --- ENHANCED MOCK DATA (For development and fallback) ---
  async getEnhancedMockData() {
    console.log('📱 Generating enhanced Meta mock data');
    // (Keep your existing, detailed getEnhancedMockData() method here)
    // It should return the full, structured mock data object you already have.
    // For brevity, returning a placeholder structure.
    return {
      account_overview: {
        account_name: "[Mock] Digital Marketing Agency",
        account_status: "ACTIVE",
        amount_spent: 12450.75,
        currency: "USD"
      },
      campaign_performance: [/* ... mock campaigns ... */],
      key_metrics: { /* ... mock metrics ... */ },
      data_quality: "ENHANCED_MOCK_DATA",
      note: "Connect with a real access token for live data."
    };
  }

  // 🎯 NEW: Check Token Status (for your UI warnings)
  async getTokenStatus(tenantId, reportConfigId) {
    try {
      const { tokens, adAccountId } = await this.getStoredMetaTokens(tenantId, reportConfigId);
      if (!tokens?.access_token) {
        return { connected: false, message: 'No token stored.' };
      }

      const isExpired = new Date(tokens.expires_at) < new Date();
      const daysUntilExpiry = Math.ceil((new Date(tokens.expires_at) - new Date()) / (1000 * 60 * 60 * 24));

      return {
        connected: true,
        is_expired: isExpired,
        expires_at: tokens.expires_at,
        days_until_expiry: daysUntilExpiry,
        ad_account_id: adAccountId,
        connection_type: 'manual_token'
      };
    } catch (error) {
      console.log('🔍 Token status check: No configuration found.');
      return { connected: false, message: 'Not connected.' };
    }
  }
}

module.exports = new MetaOAuthService();