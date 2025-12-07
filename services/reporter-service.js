const supabase = require('../lib/supabase');
const pdfService = require('./pdf-service');
const emailService = require('./email-service');
const unifiedReporterService = require('./unified-reporter-service');

class ReporterService {
    async generateAndSendReport(reportConfigId, tenantId) {
        const startTime = Date.now();
        const MAX_DURATION = 55000; // 55 seconds for Netlify safety
        
        try {
            console.log(`📊 Starting report generation for config: ${reportConfigId}`);
            
            // 1. Fetch report configuration and client details
            const reportConfig = await this.getReportConfig(reportConfigId, tenantId);
            if (!reportConfig) {
                throw new Error('Report configuration not found');
            }

            // 2. Generate PDF report
            console.log('🔄 Generating PDF report...');
            const { pdfBuffer, fileName } = await this.generatePDFReport(reportConfig);
            
            // 3. Upload to Supabase Storage
            console.log('☁️ Uploading to storage...');
            const fileUrl = await this.uploadToStorage(pdfBuffer, fileName, tenantId);
            
            // 4. Send email to client WITH PDF BUFFER
            console.log('📧 Sending email...');
            const emailResult = await this.sendClientEmail(reportConfig, fileUrl, pdfBuffer);
            
            // 5. Update database records WITH EMAIL RESULT
            console.log('💾 Updating database...');
            await this.updateDatabase(reportConfigId, tenantId, fileUrl, 'delivered', null, emailResult);
            
            // ✅ ADD: Check timeout during long operations
            if (Date.now() - startTime > MAX_DURATION) {
                console.warn('⚠️ Report generation approaching timeout limit');
            }
            
            return {
                success: true,
                reportUrl: fileUrl,
                emailMessageId: emailResult.messageId,
                clientName: reportConfig.clients.client_name,
                processingTime: Date.now() - startTime,
                message: 'Report generated and delivered successfully'
            };

        } catch (error) {
            console.error('❌ Reporter service error:', error);
            
            // Update database with error
            await this.updateDatabase(reportConfigId, tenantId, null, 'failed', error.message);
            
            // Re-throw for route handler
            throw error;
        }
    }

    async generatePDFReport(reportConfig) {
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - 30);
    const periodEnd = new Date();

    console.log('🌐 Generating PDF with revolutionary AI features...');

    // 🆕 Get report configuration for AI settings
    const aiEnabled = !!reportConfig.ai_insights_enabled;

    // Use the ENHANCED unified reporter with AI insights
    const unifiedReport = await unifiedReporterService.generateUnifiedReport(
        reportConfig.tenant_id,
        reportConfig.id,
        {
            dateRange: { startDate: '30daysAgo', endDate: 'today' },
            predictionPeriods: 3,
            include_anomalies: aiEnabled,
            include_benchmarks: aiEnabled,
            industry: reportConfig.industry || 'digital_agency'
        }
    );

    // Generate template data with enhanced AI insights
    const templateData = pdfService.generateMockAnalyticsData(
        reportConfig.clients.client_name,
        periodStart.toLocaleDateString(),
        periodEnd.toLocaleDateString()
    );

    // Add agency branding
    templateData.agencyName = reportConfig.tenants.company_name;
    templateData.agencyLogo = reportConfig.tenants.logo_path;
    templateData.clientLogo = reportConfig.clients.logo_path;

    // 🧠 ADD REVOLUTIONARY AI DATA TO TEMPLATE
    templateData.unified_report = unifiedReport || {};
    templateData.has_ai_insights = !!(unifiedReport && unifiedReport.ai_insights && unifiedReport.ai_insights.success);
    templateData.ai_insights = unifiedReport.ai_insights || {};

    // ✅ Template flags for conditional rendering (guarded)
    templateData.has_predictive_analytics = Array.isArray(unifiedReport.ai_insights?.predictions?.revenue_forecast)
        && unifiedReport.ai_insights.predictions.revenue_forecast.length > 0;

    templateData.has_anomaly_detection = Array.isArray(unifiedReport.ai_insights?.anomaly_detection?.anomalies)
        && unifiedReport.ai_insights.anomaly_detection.anomalies.length > 0;

    templateData.has_competitive_benchmarks = !!(unifiedReport.ai_insights?.competitive_benchmarks || unifiedReport.competitive_benchmarks);

    templateData.performance_score = unifiedReport.performance_scorecard?.overall_score ?? 0;

    // ✅ Template flags for score colors
    if (typeof templateData.performance_score === 'number') {
        templateData.performance_score_high = templateData.performance_score >= 8;
        templateData.performance_score_medium = templateData.performance_score >= 6 && templateData.performance_score < 8;
        templateData.performance_score_low = templateData.performance_score < 6;
    }

    // Add cross-platform metrics (guarded)
    if (unifiedReport.blended_metrics) {
        templateData.cross_platform = {
            blended_roas: unifiedReport.cross_platform_analysis?.blended_roas?.roas_value ?? null,
            total_revenue: unifiedReport.blended_metrics?.total_revenue ?? 0,
            total_ad_spend: unifiedReport.blended_metrics?.total_ad_spend ?? 0
        };
    }

    // Final rendering
    const pdfBuffer = await pdfService.generateProfessionalPDF(templateData);

    const fileName = `reports/${reportConfig.tenant_id}/${reportConfig.id}-${Date.now()}.pdf`;

    return { pdfBuffer, fileName };
}


    async getReportConfig(reportConfigId, tenantId) {
        const { data, error } = await supabase
            .from('report_configs')
            .select(`
                *,
                clients (
                    client_name,
                    contact_email,
                    logo_path
                ),
                tenants (
                    company_name,
                    logo_path,
                    email_provider,
                    smtp_config,
                    smtp_verified
                )
            `)
            .eq('id', reportConfigId)
            .eq('tenant_id', tenantId)
            .single();

        if (error) throw error;
        return data;
    }
// Add to your reporter-service.js, in the generatePDFReport function

// File: services/reporter-service.js - UPDATED generatePDFReport method


    async uploadToStorage(pdfBuffer, fileName, tenantId) {
        const { data, error } = await supabase.storage
            .from('pdf-reports')
            .upload(fileName, pdfBuffer, {
                contentType: 'application/pdf',
                upsert: false
            });

        if (error) throw error;

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
            .from('pdf-reports')
            .getPublicUrl(fileName);

        return publicUrl;
    }

    async sendClientEmail(reportConfig, reportUrl, pdfBuffer) {
        try {
            // Get tenant with email configuration
            const { data: tenant, error } = await supabase
                .from('tenants')
                .select('*')
                .eq('id', reportConfig.tenant_id)
                .single();

            if (error) throw error;

            const emailData = {
                client_email: reportConfig.clients.contact_email,
                subject: `Your ${reportConfig.tenants.company_name} Analytics Report is Ready`,
                htmlContent: this.generateEmailTemplate(
                    reportConfig.clients.client_name, 
                    reportUrl, 
                    reportConfig.tenants.company_name
                ),
                report_id: reportConfig.id
            };

            // Pass the PDF buffer for email attachment
            const emailResult = await emailService.sendReport(tenant, emailData, pdfBuffer, reportConfig.id);
            
            return emailResult;

        } catch (error) {
            console.error('Email sending failed:', error);
            throw error;
        }
    }

    generateEmailTemplate(clientName, reportUrl, agencyName) {
        return `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #2c5aa0; color: white; padding: 20px; text-align: center; }
        .content { background: #f9f9f9; padding: 30px; }
        .button { background: #2c5aa0; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Your Analytics Report is Ready</h1>
        </div>
        <div class="content">
            <p>Dear ${clientName},</p>
            <p>Your latest analytics report from <strong>${agencyName}</strong> has been generated and is now available for review.</p>
            <p>This comprehensive report provides insights into your website performance, traffic sources, and key metrics for the reporting period.</p>
            <p style="text-align: center; margin: 30px 0;">
                <a href="${reportUrl}" class="button">View Your Report</a>
            </p>
            <p>If you have any questions about the data or would like to discuss optimization strategies, please don't hesitate to reach out.</p>
            <p>Best regards,<br>The ${agencyName} Team</p>
        </div>
        <div class="footer">
            <p>This report was automatically generated by ReportFlow</p>
            <p>If you believe you received this email in error, please disregard it.</p>
        </div>
    </div>
</body>
</html>
        `;
    }

    async updateDatabase(reportConfigId, tenantId, fileUrl, status, errorMessage = null, deliveryResult = null) {
        // Calculate delivery attempts
        const deliveryAttempts = deliveryResult?.attempt_number || 1;

        // Record in generated_reports table with delivery info
        const { data: reportData, error: reportError } = await supabase
            .from('generated_reports')
            .insert({
                tenant_id: tenantId,
                report_config_id: reportConfigId,
                status: status,
                file_url: fileUrl,
                error_message: errorMessage,
                delivery_method: deliveryResult?.delivery_method,
                sent_via: deliveryResult?.provider,
                delivery_error: deliveryResult?.fallback_reason,
                delivery_attempts: deliveryAttempts
            })
            .select()
            .single();

        if (reportError) throw reportError;

        // Update usage metrics if successful
        if (status === 'delivered') {
            const currentMonth = new Date().toISOString().slice(0, 7) + '-01';
            
            // ✅ FIXED: Get current count and increment manually
            const { data: tenantData, error: tenantError } = await supabase
                .from('tenants')
                .select('email_sent_count')
                .eq('id', tenantId)
                .single();

            if (!tenantError && tenantData) {
                const { error: emailCountError } = await supabase
                    .from('tenants')
                    .update({ 
                        email_sent_count: (tenantData.email_sent_count || 0) + 1
                    })
                    .eq('id', tenantId);

                if (emailCountError) console.error('Email count update error:', emailCountError);
            }

            // ✅ FIXED: Update tenant_usage table without raw()
            const { data: usageData, error: usageSelectError } = await supabase
                .from('tenant_usage')
                .select('reports_sent')
                .eq('tenant_id', tenantId)
                .eq('month', currentMonth)
                .single();

            let currentReportsSent = 0;
            if (!usageSelectError && usageData) {
                currentReportsSent = usageData.reports_sent || 0;
            }

            const { error: usageError } = await supabase
                .from('tenant_usage')
                .upsert({
                    tenant_id: tenantId,
                    month: currentMonth,
                    reports_sent: currentReportsSent + 1,
                    last_reset_date: currentMonth
                }, {
                    onConflict: 'tenant_id,month'
                });

            if (usageError) console.error('Usage update error:', usageError);
        }

        return reportData;
    }

    // In reporter-service.js - Add timeout awareness
        async generateAndSendReport(reportConfigId, tenantId) {
        const startTime = Date.now();
        const MAX_DURATION = 55000; // 55 seconds for safety
        
        // Check timeout periodically in loops
        if (Date.now() - startTime > MAX_DURATION) {
            throw new Error('Operation timed out in serverless environment');
        }
        // ... rest of your code
        }
}

module.exports = new ReporterService();