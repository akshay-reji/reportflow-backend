// File: middleware/usage-limits.js - NEW FILE
const supabase = require('../lib/supabase');

class UsageTrackingMiddleware {
  
  async checkUsage(req, res, next) {
    try {
      const tenantId = req.headers['x-tenant-id'] || req.body.tenant_id || req.query.tenant_id;
      
      if (!tenantId) {
        return res.status(400).json({ 
          success: false, 
          error: 'Tenant ID required for usage tracking' 
        });
      }

      // Check subscription status first
      const { data: subscription, error: subError } = await supabase
        .from('tenant_subscriptions')
        .select(`
          status,
          grace_period_until,
          plan_id,
          plans (
            max_reports_per_month,
            max_clients,
            max_data_sources
          )
        `)
        .eq('tenant_id', tenantId)
        .single();

      if (subError || !subscription) {
        return res.status(403).json({ 
          success: false, 
          error: 'No active subscription found' 
        });
      }

      // Check if in grace period
      if (subscription.grace_period_until && new Date() < new Date(subscription.grace_period_until)) {
        console.log(`⏳ Tenant ${tenantId} in grace period, allowing request`);
        return next();
      }

      // Check if subscription is active
      if (subscription.status !== 'active') {
        return res.status(403).json({ 
          success: false, 
          error: 'Subscription not active' 
        });
      }

      // Get current month usage
      const currentMonth = new Date().toISOString().slice(0, 7) + '-01';
      
      const { data: usage, error: usageError } = await supabase
        .from('tenant_usage')
        .select('reports_sent, client_count, data_sources_connected')
        .eq('tenant_id', tenantId)
        .eq('month', currentMonth)
        .single();

      const currentUsage = usage || { 
        reports_sent: 0, 
        client_count: 0, 
        data_sources_connected: 0 
      };

      const plan = subscription.plans;
      
      // Check specific limits based on route
      const route = req.path;
      let limitExceeded = false;
      let limitType = '';

      if (route.includes('/api/reporter/generate')) {
        if (plan.max_reports_per_month && currentUsage.reports_sent >= plan.max_reports_per_month) {
          limitExceeded = true;
          limitType = 'reports';
        }
      } else if (route.includes('/api/clients/create')) {
        if (plan.max_clients && currentUsage.client_count >= plan.max_clients) {
          limitExceeded = true;
          limitType = 'clients';
        }
      }

      if (limitExceeded) {
        return res.status(429).json({
          success: false,
          error: `Plan limit exceeded for ${limitType}`,
          usage: currentUsage,
          limits: {
            reports: plan.max_reports_per_month,
            clients: plan.max_clients
          },
          upgrade_url: '/api/payment/upgrade'
        });
      }

      // Store usage info for post-processing
      req.tenantUsage = {
        tenantId,
        currentUsage,
        plan,
        route
      };

      next();
    } catch (error) {
      console.error('❌ Usage tracking middleware error:', error);
      // Allow request to proceed on error (fail open for now)
      next();
    }
  }

  async incrementUsage(req, res, next) {
    try {
      if (!req.tenantUsage) return next();

      const { tenantId, currentUsage, route } = req.tenantUsage;
      const currentMonth = new Date().toISOString().slice(0, 7) + '-01';

      let updateData = {};

      if (route.includes('/api/reporter/generate')) {
        updateData.reports_sent = (currentUsage.reports_sent || 0) + 1;
      } else if (route.includes('/api/clients/create')) {
        updateData.client_count = (currentUsage.client_count || 0) + 1;
      }

      if (Object.keys(updateData).length > 0) {
        await supabase
          .from('tenant_usage')
          .upsert({
            tenant_id: tenantId,
            month: currentMonth,
            ...updateData,
            last_updated: new Date().toISOString()
          }, {
            onConflict: 'tenant_id,month'
          });
      }

      next();
    } catch (error) {
      console.error('❌ Usage increment error:', error);
      next();
    }
  }
}

module.exports = new UsageTrackingMiddleware();