const nodemailer = require('nodemailer');
const { Resend } = require('resend');
const encryptionService = require('./encryption-service');
const supabase = require('../lib/supabase');

class EmailService {
  constructor() {
    // ✅ FIX: Better Resend API key validation
    if (process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.startsWith('re_')) {
      this.resend = new Resend(process.env.RESEND_API_KEY);
      console.log('✅ Resend client initialized with valid API key');
    } else {
      console.warn('⚠️ RESEND_API_KEY not found or invalid. Resend email functionality disabled.');
      console.warn('🔧 Current RESEND_API_KEY:', process.env.RESEND_API_KEY ? 'Set (but invalid format)' : 'Not set');
      this.resend = null;
    }
  }
  }

  async sendReport(tenant, reportData, pdfBuffer, reportId) {
    // Check if Resend is available for non-SMTP delivery
    if (!this.resend && tenant.email_provider !== 'smtp') {
      throw new Error('Resend API key not configured. Please set RESEND_API_KEY environment variable or use SMTP.');
    }

    const emailData = {
      to: reportData.client_email,
      subject: reportData.subject,
      html: reportData.htmlContent,
      attachments: pdfBuffer ? [{
        filename: `report-${reportData.report_id || reportId || 'test'}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf'
      }] : [],
      agency_name: tenant.company_name
    };

    let attemptNumber = 1;
    let finalResult;

    console.log(`📧 Starting email delivery for tenant: ${tenant.id}, provider: ${tenant.email_provider}`);

    // Try agency SMTP first if configured and verified
    if (tenant.email_provider === 'smtp' && tenant.smtp_config && tenant.smtp_verified) {
      try {
        console.log(`📧 Attempt ${attemptNumber}: SMTP delivery for tenant: ${tenant.id}`);
        finalResult = await this.sendViaSMTP(tenant, emailData);
        finalResult.delivery_method = 'smtp';
        finalResult.provider = 'agency_smtp';
        finalResult.attempt_number = attemptNumber;
        
        // Log successful SMTP attempt
        await this.logEmailDelivery(tenant.id, reportId, {
          attempt_number: attemptNumber,
          delivery_method: 'smtp',
          provider_used: 'agency_smtp',
          success: true,
          message_id: finalResult.messageId
        });

      } catch (smtpError) {
        console.log(`❌ SMTP attempt ${attemptNumber} failed:`, smtpError.message);
        
        // Log failed SMTP attempt
        await this.logEmailDelivery(tenant.id, reportId, {
          attempt_number: attemptNumber,
          delivery_method: 'smtp',
          provider_used: 'agency_smtp',
          success: false,
          error_message: smtpError.message
        });

        attemptNumber++;
        
        // Fallback to Resend only if available
        if (this.resend) {
          try {
            console.log(`📧 Attempt ${attemptNumber}: Resend fallback for tenant: ${tenant.id}`);
            finalResult = await this.sendViaResend(tenant, emailData);
            finalResult.delivery_method = 'resend_fallback';
            finalResult.provider = 'resend';
            finalResult.fallback_reason = smtpError.message;
            finalResult.attempt_number = attemptNumber;
            
            // Log successful fallback
            await this.logEmailDelivery(tenant.id, reportId, {
              attempt_number: attemptNumber,
              delivery_method: 'resend',
              provider_used: 'resend',
              success: true,
              message_id: finalResult.messageId
            });

          } catch (resendError) {
            // Log failed fallback
            await this.logEmailDelivery(tenant.id, reportId, {
              attempt_number: attemptNumber,
              delivery_method: 'resend',
              provider_used: 'resend',
              success: false,
              error_message: resendError.message
            });
            
            throw resendError;
          }
        } else {
          throw new Error(`SMTP failed and Resend fallback not available: ${smtpError.message}`);
        }
      }
    } else {
      // Primary Resend delivery - only if Resend is available
      if (!this.resend) {
        throw new Error('Resend email provider selected but RESEND_API_KEY not configured');
      }

      try {
        console.log(`📧 Primary Resend delivery for tenant: ${tenant.id}`);
        finalResult = await this.sendViaResend(tenant, emailData);
        finalResult.delivery_method = 'resend';
        finalResult.provider = 'resend';
        finalResult.attempt_number = 1;
        
        // Log Resend attempt
        await this.logEmailDelivery(tenant.id, reportId, {
          attempt_number: 1,
          delivery_method: 'resend',
          provider_used: 'resend',
          success: finalResult.success,
          message_id: finalResult.messageId,
          error_message: finalResult.error
        });
      } catch (resendError) {
        // Log failed Resend attempt
        await this.logEmailDelivery(tenant.id, reportId, {
          attempt_number: 1,
          delivery_method: 'resend',
          provider_used: 'resend',
          success: false,
          error_message: resendError.message
        });
        throw resendError;
      }
    }

    console.log(`✅ Email delivery completed for tenant: ${tenant.id}`);
    return finalResult;
  }

  async sendViaSMTP(tenant, emailData) {
    try {
      console.log(`🔧 Configuring SMTP for: ${tenant.company_name}`);
      
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
      console.log(`🔐 Verifying SMTP connection to: ${smtpConfig.host}`);
      await transporter.verify();
      console.log(`✅ SMTP connection verified`);

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

      console.log(`📤 Sending SMTP email to: ${emailData.to}`);
      const info = await transporter.sendMail(mailOptions);
      
      console.log(`✅ SMTP email sent: ${info.messageId}`);
      
      return {
        success: true,
        messageId: info.messageId,
        provider: 'smtp'
      };

    } catch (error) {
      console.error('❌ SMTP send error:', error);
      throw new Error(`SMTP delivery failed: ${error.message}`);
    }
  }

  async sendViaResend(tenant, emailData) {
    // ✅ FIX: Check if Resend is available
    if (!this.resend) {
      throw new Error('Resend client not initialized. Check RESEND_API_KEY environment variable.');
    }

    try {
      console.log(`🔧 Configuring Resend for: ${tenant.company_name}`);
      
      let fromEmail;
      
      if (tenant.smtp_config) {
        try {
          const smtpConfig = encryptionService.decryptSMTPConfig(tenant.smtp_config);
          fromEmail = `"${tenant.company_name}" <${smtpConfig.from_email || 'reports@reportflow.dev'}>`;
        } catch (e) {
          fromEmail = `"${tenant.company_name}" <reports@reportflow.dev>`;
        }
      } else {
        fromEmail = `"${tenant.company_name}" <reports@reportflow.dev>`;
      }

      // Convert attachments for Resend format
      const resendAttachments = emailData.attachments && emailData.attachments.length > 0 
        ? emailData.attachments.map(att => ({
            filename: att.filename,
            content: att.content.toString('base64') // Resend requires base64
          }))
        : [];

      console.log(`📤 Sending Resend email to: ${emailData.to}`);
      const { data, error } = await this.resend.emails.send({
        from: fromEmail,
        to: emailData.to,
        subject: emailData.subject,
        html: emailData.html,
        attachments: resendAttachments
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
      console.error('❌ Resend send error:', error);
      throw new Error(`Resend delivery failed: ${error.message}`);
    }
  }

  async testSMTP(config) {
    try {
      console.log(`🧪 Testing SMTP configuration for: ${config.host}`);
      
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
      console.log(`✅ SMTP connection verified`);
      
      // Try to send a test email
      const testEmail = {
        from: config.from_email || `test@${this.extractDomain(config.host)}`,
        to: config.auth.user, // Send test to themselves
        subject: 'ReportFlow SMTP Test',
        html: '<p>This is a test email from ReportFlow to verify your SMTP configuration.</p><p>If you received this, your SMTP settings are working correctly!</p>'
      };

      const info = await transporter.sendMail(testEmail);
      console.log(`✅ SMTP test email sent: ${info.messageId}`);
      
      return { 
        success: true,
        message: 'SMTP configuration verified successfully',
        messageId: info.messageId
      };
      
    } catch (error) {
      console.error('❌ SMTP test failed:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  async logEmailDelivery(tenantId, reportId, attemptData) {
    try {
      console.log(`📝 Logging email delivery for tenant: ${tenantId}, report: ${reportId}`);
      
      const { error } = await supabase
        .from('email_delivery_logs')
        .insert({
          tenant_id: tenantId,
          report_id: reportId,
          attempt_number: attemptData.attempt_number || 1,
          delivery_method: attemptData.delivery_method,
          provider_used: attemptData.provider_used,
          success: attemptData.success,
          error_message: attemptData.error_message,
          message_id: attemptData.message_id
        });

      if (error) {
        console.error('❌ Failed to log email delivery:', error);
      } else {
        console.log(`✅ Email delivery logged successfully`);
      }
    } catch (error) {
      console.error('❌ Email delivery logging error:', error);
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
    try {
      const { error } = await supabase
        .from('tenants')
        .update({ 
          last_email_error: errorMessage,
          smtp_verified: false // Mark as unverified on error
        })
        .eq('id', tenantId);

      if (error) {
        console.error('❌ Failed to update tenant error:', error);
      }
    } catch (error) {
      console.error('❌ Tenant error update failed:', error);
    }
  }
}

module.exports = new EmailService();