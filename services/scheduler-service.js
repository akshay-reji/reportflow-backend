// services/scheduler-service.js - SIMPLIFIED WORKING VERSION
const supabase = require('../lib/supabase');

class SchedulerService {
  async executeScheduler() {
    try {
      console.log('🔍 Master Scheduler Test Started...');
      
      // STEP 1: Test basic database connection
      const { data: tenants, error: tenantsError } = await supabase
        .from('tenants')
        .select('id, company_name')
        .limit(5);

      if (tenantsError) {
        throw new Error(`Tenants query failed: ${tenantsError.message}`);
      }

      // STEP 2: Get report configs (simple query first)
      const { data: reports, error: reportsError } = await supabase
        .from('report_configs')
        .select('id, name, tenant_id, next_scheduled_run, is_active')
        .lte('next_scheduled_run', new Date().toISOString())
        .eq('is_active', true)
        .limit(10);

      if (reportsError) {
        throw new Error(`Reports query failed: ${reportsError.message}`);
      }

      console.log(`📋 Found ${reports?.length || 0} due reports`);
      
      // STEP 3: For each report, check subscription status individually
      const eligibleReports = [];
      
      if (reports && reports.length > 0) {
        for (const report of reports) {
          const isEligible = await this.checkReportEligibility(report);
          if (isEligible) {
            eligibleReports.push(report);
          }
        }
      }

      console.log(`🎯 ${eligibleReports.length} reports eligible for execution`);

      // STEP 4: Update next scheduled runs
      if (reports && reports.length > 0) {
        for (const report of reports) {
          const nextRun = this.calculateNextRun(report);
          await supabase
            .from('report_configs')
            .update({ next_scheduled_run: nextRun })
            .eq('id', report.id);
        }
        console.log('✅ Updated next scheduled runs');
      }

      return {
        success: true,
        message: 'Scheduler executed successfully!',
        stats: {
          total_tenants: tenants?.length || 0,
          due_reports: reports?.length || 0,
          eligible_reports: eligibleReports.length
        },
        sample_tenants: tenants?.slice(0, 3) || [],
        sample_reports: reports?.slice(0, 3) || []
      };
      
    } catch (error) {
      console.error('💥 Scheduler failed:', error.message);
      return { 
        success: false, 
        error: error.message,
        note: 'Database query issue - check table relationships'
      };
    }
  }

  async checkReportEligibility(report) {
    try {
      // Check tenant subscription status
      const { data: subscription, error } = await supabase
        .from('tenant_subscriptions')
        .select(`
          status,
          current_period_end,
          grace_period_until,
          plan_id,
          plans (
            max_reports_per_month,
            max_clients
          )
        `)
        .eq('tenant_id', report.tenant_id)
        .eq('status', 'active')
        .single();

      if (error || !subscription) {
        console.log(`🚫 ${report.id}: No active subscription`);
        return false;
      }

      // Check if subscription period is valid
      if (new Date() > new Date(subscription.current_period_end)) {
        console.log(`🚫 ${report.id}: Subscription period ended`);
        return false;
      }

      // Check usage for current month
      const currentMonth = new Date().toISOString().slice(0, 7) + '-01';
      const { data: usage, error: usageError } = await supabase
        .from('tenant_usage')
        .select('reports_sent')
        .eq('tenant_id', report.tenant_id)
        .eq('month', currentMonth)
        .single();

      const reportsSent = usage ? usage.reports_sent : 0;
      const plan = subscription.plans;

      if (plan.max_reports_per_month && reportsSent >= plan.max_reports_per_month) {
        console.log(`🚫 ${report.id}: Monthly limit exceeded (${reportsSent}/${plan.max_reports_per_month})`);
        return false;
      }

      console.log(`✅ ${report.id}: Eligible - ${reportsSent}/${plan.max_reports_per_month} reports used`);
      return true;

    } catch (error) {
      console.error(`❌ Eligibility check failed for ${report.id}:`, error.message);
      return false;
    }
  }

  calculateNextRun(report) {
    const next = new Date();
    next.setDate(next.getDate() + 7); // Default: weekly
    return next.toISOString();
  }
}

module.exports = new SchedulerService();