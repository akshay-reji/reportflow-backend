const supabase = require('../lib/supabase');
const pdfService = require('./pdf-service');
const emailService = require('./email-service');

class ReporterService {
    async generateAndSendReport(reportConfigId, tenantId) {
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
            
            return {
                success: true,
                reportUrl: fileUrl,
                emailMessageId: emailResult.messageId,
                clientName: reportConfig.clients.client_name,
                message: 'Report generated and delivered successfully'
            };

        } catch (error) {
            console.error('❌ Reporter service error:', error);
            
            // Update database with error
            await this.updateDatabase(reportConfigId, tenantId, null, 'failed', error.message);
            
            throw error;
        }
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

    async generatePDFReport(reportConfig) {
        const periodStart = new Date();
        periodStart.setDate(periodStart.getDate() - 30); // Last 30 days
        
        const periodEnd = new Date();

        // Generate mock data
        const templateData = pdfService.generateMockAnalyticsData(
            reportConfig.clients.client_name,
            periodStart.toLocaleDateString(),
            periodEnd.toLocaleDateString()
        );

        // Add agency branding
        templateData.agencyName = reportConfig.tenants.company_name;
        templateData.agencyLogo = reportConfig.tenants.logo_path;
        templateData.clientLogo = reportConfig.clients.logo_path;

        const pdfBuffer = await pdfService.generateProfessionalPDF(templateData);
        
        const fileName = `reports/${reportConfig.tenant_id}/${reportConfig.id}-${Date.now()}.pdf`;
        
        return { pdfBuffer, fileName };
    }

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
}

module.exports = new ReporterService();