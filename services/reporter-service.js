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
            
            // 4. Send email to client
            console.log('📧 Sending email...');
            await this.updateDatabase(reportConfigId, tenantId, fileUrl, 'delivered', null, emailResult);
            
            // 5. Update database records
            console.log('💾 Updating database...');
            await this.updateDatabase(reportConfigId, tenantId, fileUrl, 'delivered');
            
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
                    logo_path
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

        // Generate mock data (replace with real API calls to Google Analytics, etc.)
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
        
        const fileName = `reports/${tenantId}/${reportConfigId}-${Date.now()}.pdf`;
        
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

    async sendClientEmail(reportConfig, reportUrl) {
        return await emailService.sendReportEmail(
            reportConfig.clients.contact_email,
            reportConfig.clients.client_name,
            reportUrl,
            reportConfig.tenants.company_name
        );
    }

    async updateDatabase(reportConfigId, tenantId, fileUrl, status, errorMessage = null, deliveryResult = null) {
  // Record in generated_reports table with delivery info
  const { error: reportError } = await supabase
    .from('generated_reports')
    .insert({
      tenant_id: tenantId,
      report_config_id: reportConfigId,
      status: status,
      file_url: fileUrl,
      error_message: errorMessage,
      delivery_method: deliveryResult?.delivery_method,
      sent_via: deliveryResult?.sent_via,
      delivery_error: deliveryResult?.fallback_reason
    });

  if (reportError) throw reportError;

  // Update usage metrics if successful
  if (status === 'delivered') {
    const currentMonth = new Date().toISOString().slice(0, 7) + '-01';
    
    // Increment email count for tenant
    const { error: emailCountError } = await supabase
      .from('tenants')
      .update({ 
        email_sent_count: supabase.raw('email_sent_count + 1')
      })
      .eq('id', tenantId);

    if (emailCountError) console.error('Email count update error:', emailCountError);
  }
}

async sendClientEmail(reportConfig, reportUrl) {
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

    const emailResult = await emailService.sendReport(tenant, emailData, null);
    
    return emailResult;

  } catch (error) {
    console.error('Email sending failed:', error);
    throw error;
  }
}





   

    
}

module.exports = new ReporterService();