// middleware/usage-limits.js
const supabase = require('../lib/supabase').getClient();

/**
 * Middleware to check if a tenant has exceeded their plan limits.
 * Denies the request with HTTP 429 if the limit is exceeded.
 */
const checkUsage = async (req, res, next) => {
  const tenantId = req.tenantId || req.headers['x-tenant-id'] || req.body.tenant_id;
  
  if (!tenantId) {
    console.warn('Usage check called without tenant ID');
    return next(); // Fail open for now, but could deny
  }

  try {
    // 1. Get the tenant's current active subscription and plan limits
    const { data: subscription, error: subError } = await supabase
      .from('tenant_subscriptions')
      .select(`
        status,
        plan_id,
        plans!inner (
          max_reports_per_month,
          max_clients,
          max_data_sources
        )
      `)
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .gte('current_period_end', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (subError || !subscription) {
      console.log(`No active subscription found for tenant ${tenantId}. Allowing request.`);
      return next(); // Fail open: no subscription -> no enforcement
    }

    const planLimits = subscription.plans;

    // 2. Get current month's usage
    const currentMonth = new Date().toISOString().slice(0, 7) + '-01'; // YYYY-MM-01 format
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

    // 3. Check reports limit (the primary check for report generation)
    if (planLimits.max_reports_per_month !== null && 
        currentUsage.reports_sent >= planLimits.max_reports_per_month) {
      return res.status(429).json({
        success: false,
        error: 'Plan limit exceeded',
        message: `You have reached your monthly limit of ${planLimits.max_reports_per_month} reports.`,
        limit: 'reports_per_month',
        current: currentUsage.reports_sent,
        max: planLimits.max_reports_per_month,
        reset: 'At the start of next month'
      });
    }

    // 4. Attach usage info to the request for potential logging
    req.usageInfo = {
      tenantId,
      planId: subscription.plan_id,
      limits: planLimits,
      currentUsage
    };

    next();
  } catch (error) {
    console.error('Error in checkUsage middleware:', error);
    // Fail open to avoid blocking service if middleware fails
    next();
  }
};

/**
 * Function to increment usage counter for a tenant.
 * Call this after a successful report generation.
 */
const incrementUsage = async (tenantId, usageType = 'reports', amount = 1) => {
  if (!tenantId) return;

  try {
    const currentMonth = new Date().toISOString().slice(0, 7) + '-01';
    const column = usageType === 'reports' ? 'reports_sent' :
                   usageType === 'clients' ? 'client_count' :
                   'data_sources_connected';

    // Upsert: Insert new row for month or increment existing
    const { error } = await supabase.rpc('increment_usage', {
      p_tenant_id: tenantId,
      p_month: currentMonth,
      p_column_name: column,
      p_increment_amount: amount
    });

    if (error) {
      // If RPC fails, try direct upsert approach
      console.log('Falling back to direct upsert for usage increment');
      
      // First, try to update existing row
      const { data: existing } = await supabase
        .from('tenant_usage')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('month', currentMonth)
        .single();

      if (existing) {
        await supabase
          .from('tenant_usage')
          .update({ 
            [column]: supabase.rpc('increment', { x: column, inc: amount }),
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id);
      } else {
        // Insert new row
        await supabase
          .from('tenant_usage')
          .insert({
            tenant_id: tenantId,
            month: currentMonth,
            [column]: amount,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
      }
    }

    console.log(`Incremented ${usageType} usage for tenant ${tenantId}`);
  } catch (error) {
    console.error('Error incrementing usage:', error);
    // Don't throw - usage tracking shouldn't break core functionality
  }
};

/**
 * Admin override middleware for debugging
 */
const adminOverride = (req, res, next) => {
  const adminKey = req.headers['x-admin-override'];
  if (adminKey && adminKey === process.env.ADMIN_OVERRIDE_SECRET) {
    req.usageBypass = true;
    console.log('Admin override enabled for usage limits');
  }
  next();
};

module.exports = {
  checkUsage,
  incrementUsage,
  adminOverride
};