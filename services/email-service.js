const nodemailer = require('nodemailer');
const { Resend } = require('resend');
const encryptionService = require('./encryption-service');

class EmailService {
  constructor() {
    this.resend = new Resend(process.env.RESEND_API_KEY);
  }

  async sendReport(tenant, reportData, pdfBuffer) {
    const emailData = {
      to: reportData.client_email,
      subject: reportData.subject,
      html: reportData.htmlContent,
      attachments: [{
        filename: `report-${reportData.report_id}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf'
      }],
      agency_name: tenant.company_name
    };

    let result;
    
    // Try agency SMTP first if configured and verified
    if (tenant.email_provider === 'smtp' && tenant.smtp_config && tenant.smtp_verified) {
      try {
        console.log(`📧 Attempting SMTP delivery for tenant: ${tenant.id}`);
        result = await this.sendViaSMTP(tenant, emailData);
        result.delivery_method = 'smtp';
        result.sent_via = 'agency_smtp';
      } catch (smtpError) {
        console.log(`❌ SMTP failed for tenant ${tenant.id}, falling back to Resend:`, smtpError.message);
        
        // Fallback to Resend
        result = await this.sendViaResend(tenant, emailData);
        result.delivery_method = 'resend_fallback';
        result.sent_via = 'resend';
        result.fallback_reason = smtpError.message;
        
        // Update tenant with error for monitoring
        await this.updateTenantError(tenant.id, smtpError.message);
      }
    } else {
      // Use Resend as primary
      console.log(`📧 Using Resend delivery for tenant: ${tenant.id}`);
      result = await this.sendViaResend(tenant, emailData);
      result.delivery_method = 'resend';
      result.sent_via = 'resend';
    }

    return result;
  }

  async sendViaSMTP(tenant, emailData) {
    try {
      // Decrypt SMTP config
      const smtpConfig = encryptionService.decryptSMTPConfig(tenant.smtp_config);
      
      const transporter = nodemailer.createTransport({
        host: smtpConfig.host,
        port: smtpConfig.port || 587,
        secure: smtpConfig.secure || false,
        auth: {
          user: smtpConfig.auth.user,
          pass: smtpConfig.auth.pass
        },
        // Better error handling
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000
      });

      // Verify connection first
      await transporter.verify();

      const fromEmail = smtpConfig.from_email || `reports@${this.extractDomain(smtpConfig.host)}`;

      const mailOptions = {
        from: `"${tenant.company_name}" <${fromEmail}>`,
        to: emailData.to,
        subject: emailData.subject,
        html: emailData.html,
        attachments: emailData.attachments,
        // Important headers for deliverability
        headers: {
          'X-ReportFlow-Tenant': tenant.id,
          'X-ReportFlow-Generated-At': new Date().toISOString()
        }
      };

      const info = await transporter.sendMail(mailOptions);
      
      console.log(`✅ SMTP email sent: ${info.messageId}`);
      
      return {
        success: true,
        messageId: info.messageId,
        provider: 'smtp'
      };

    } catch (error) {
      console.error('SMTP send error:', error);
      throw new Error(`SMTP delivery failed: ${error.message}`);
    }
  }

  async sendViaResend(tenant, emailData) {
    try {
      const fromEmail = tenant.smtp_config?.from_email 
        ? `"${tenant.company_name}" <${this.extractFromEmail(tenant.smtp_config.from_email)}>`
        : `"${tenant.company_name}" <reports@reportflow.dev>`;

      const { data, error } = await this.resend.emails.send({
        from: fromEmail,
        to: emailData.to,
        subject: emailData.subject,
        html: emailData.html,
        attachments: emailData.attachments
      });

      if (error) {
        throw new Error(`Resend error: ${error.message}`);
      }

      console.log(`✅ Resend email sent: ${data.id}`);
      
      return {
        success: true,
        messageId: data.id,
        provider: 'resend'
      };

    } catch (error) {
      console.error('Resend send error:', error);
      throw new Error(`Resend delivery failed: ${error.message}`);
    }
  }

  async testSMTP(config) {
    try {
      const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port || 587,
        secure: config.secure || false,
        auth: {
          user: config.auth.user,
          pass: config.auth.pass
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000
      });

      await transporter.verify();
      
      // Try to send a test email
      const testEmail = {
        from: config.from_email || `test@${this.extractDomain(config.host)}`,
        to: config.auth.user, // Send test to themselves
        subject: 'ReportFlow SMTP Test',
        html: '<p>This is a test email from ReportFlow to verify your SMTP configuration.</p><p>If you received this, your SMTP settings are working correctly!</p>'
      };

      const info = await transporter.sendMail(testEmail);
      
      return { 
        success: true,
        message: 'SMTP configuration verified successfully',
        messageId: info.messageId
      };
      
    } catch (error) {
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  // Helper methods
  extractDomain(host) {
    return host.replace(/^.*\./, '');
  }

  extractFromEmail(email) {
    // Extract domain for fallback
    const match = email.match(/@(.+)/);
    return match ? `reports@${match[1]}` : 'reports@reportflow.dev';
  }

  async updateTenantError(tenantId, errorMessage) {
    // This would update the tenant's last_email_error in database
    // Implementation depends on your database service
    console.log(`Updating tenant ${tenantId} with error: ${errorMessage}`);
  }
}

module.exports = new EmailService();