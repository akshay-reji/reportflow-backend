const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');
const handlebars = require('handlebars');
const fs = require('fs').promises;
const path = require('path');

// Register Handlebars helpers
handlebars.registerHelper('formatNumber', function(number) {
    if (!number) return '0';
    return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
});

handlebars.registerHelper('if_eq', function(a, b, opts) {
    if (a === b) return opts.fn(this);
    return opts.inverse(this);
});

handlebars.registerHelper('formatDate', function(date) {
    if (!date) return 'N/A';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
});

handlebars.registerHelper('percentage', function(number) {
    if (!number) return '0%';
    return (number * 100).toFixed(1) + '%';
});

handlebars.registerHelper('ifEquals', function(arg1, arg2, options) {
    return (arg1 === arg2) ? options.fn(this) : options.inverse(this);
});

class PDFService {
    constructor() {
        this.templateCache = new Map();
    }

    async generateProfessionalPDF(templateData) {
        try {
            // Check if we have custom template content
            if (templateData.template_html) {
                // Use custom template
                return await this.generatePDFFromHTML(
                    templateData.template_html,
                    templateData,
                    templateData.template_css
                );
            } else {
                // Use default template file
                const defaultTemplate = await fs.readFile(
                    'templates/analytics-report.html', 
                    'utf8'
                );
                return await this.generatePDFFromHTML(
                    defaultTemplate,
                    templateData
                );
            }
        } catch (error) {
            console.error('PDF generation failed:', error);
            throw new Error(`Failed to generate PDF: ${error.message}`);
        }
    }

    async getTemplateStyles(templateName) {
  try {
    const styleMap = {
      'professional': 'styles/professional.css',
      'minimal': 'styles/minimal.css',
      'dark-mode': 'styles/dark-mode.css',
      'creative': 'styles/creative.css'
    };
    
    const styleFile = styleMap[templateName] || 'styles/professional.css';
    const stylePath = path.join(__dirname, '..', 'templates', styleFile);
    
    return await fs.readFile(stylePath, 'utf8');
  } catch (error) {
    console.log(`Style ${templateName} not found, using default`);
    return ''; // Fallback to inline styles
  }
}

    async generatePDFFromHTML(htmlContent, data, customCSS = null) {
        let browser = null;
        try {
            // Compile HTML template with data
            const template = handlebars.compile(htmlContent);
            const finalHTML = template(data);
            
            // Combine with CSS
            const fullHTML = this.wrapHTML(finalHTML, customCSS);
            
            // Launch browser (compatible with Netlify Functions)
            browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(), // Note: this is now a function call
            headless: chromium.headless,
            ignoreHTTPSErrors: true,
        });

            const page = await browser.newPage();
            
            // Set HTML content
            await page.setContent(fullHTML, {
                waitUntil: ['networkidle0', 'load', 'domcontentloaded']
            });

            // Generate PDF
            const pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: {
                    top: '0.5in',
                    right: '0.5in',
                    bottom: '0.5in',
                    left: '0.5in'
                },
                displayHeaderFooter: true,
                headerTemplate: '<div style="font-size: 8px; color: #666; padding: 10px;">ReportFlow Analytics Report</div>',
                footerTemplate: '<div style="font-size: 8px; color: #666; padding: 10px; width: 100%; text-align: center;">Page <span class="pageNumber"></span> of <span class="totalPages"></span> • Generated on ' + new Date().toLocaleDateString() + '</div>'
            });

            await browser.close();
            return pdfBuffer;

        } catch (error) {
            if (browser) await browser.close();
            console.error('PDF generation error:', error);
            throw error;
        }
    }

    wrapHTML(content, customCSS = null) {
        const baseCSS = `
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 100%; padding: 20px; }
            .header { background: linear-gradient(135deg, #2c5aa0 0%, #1e3a8a 100%); color: white; padding: 30px; border-radius: 8px; margin-bottom: 30px; }
            .section { margin-bottom: 30px; padding: 20px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #2c5aa0; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th { background: #2c5aa0; color: white; padding: 12px; text-align: left; }
            td { padding: 10px 12px; border-bottom: 1px solid #ddd; }
            .metric-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin: 10px 0; }
            .positive { color: #10b981; }
            .negative { color: #ef4444; }
            .ai-insight { background: #e0f2fe; border-left: 4px solid #0ea5e9; padding: 15px; margin: 10px 0; border-radius: 4px; }
            @media print { .no-print { display: none; } }
        `;

        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Analytics Report</title>
    <style>${baseCSS}</style>
    ${customCSS ? `<style>${customCSS}</style>` : ''}
</head>
<body>
    <div class="container">
        ${content}
    </div>
</body>
</html>`;
    }

    // Keep your existing mock data generator
    generateMockAnalyticsData(clientName, periodStart, periodEnd) {
        return {
            reportTitle: 'Website Analytics Report',
            agencyName: 'Digital Marketing Agency',
            agencyLogo: 'https://via.placeholder.com/200x50/2c5aa0/ffffff?text=Agency+Logo',
            clientName: clientName,
            clientLogo: 'https://via.placeholder.com/200x50/4CAF50/ffffff?text=Client+Logo',
            periodStart: periodStart,
            periodEnd: periodEnd,
            generatedAt: new Date().toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            }),
            metrics: {
                totalVisitors: 15432,
                pageViews: 45218,
                avgSessionDuration: '2m 45s',
                bounceRate: 42.3,
                visitorChange: { value: 12.5, positive: true },
                pageViewChange: { value: 8.2, positive: true },
                durationChange: { value: -3.1, positive: false },
                bounceChange: { value: -5.2, positive: true }
            },
            trafficSources: [
                { source: 'Organic Search', sessions: 6543, percentage: 42.4, bounceRate: 38.2, pagesPerSession: 3.2 },
                { source: 'Direct', sessions: 4321, percentage: 28.0, bounceRate: 45.1, pagesPerSession: 2.8 },
                { source: 'Social Media', sessions: 2876, percentage: 18.6, bounceRate: 52.3, pagesPerSession: 2.1 },
                { source: 'Referral', sessions: 1234, percentage: 8.0, bounceRate: 48.7, pagesPerSession: 2.5 },
                { source: 'Email', sessions: 458, percentage: 3.0, bounceRate: 35.2, pagesPerSession: 4.1 }
            ],
            topPages: [
                { page: '/home', pageViews: 12543, uniqueViews: 9876, avgTime: '3m 12s', exitRate: 28.4 },
                { page: '/products', pageViews: 8765, uniqueViews: 6543, avgTime: '2m 45s', exitRate: 35.2 },
                { page: '/blog', pageViews: 6543, uniqueViews: 5432, avgTime: '4m 18s', exitRate: 22.1 },
                { page: '/about', pageViews: 4321, uniqueViews: 3987, avgTime: '1m 54s', exitRate: 41.3 },
                { page: '/contact', pageViews: 2876, uniqueViews: 2654, avgTime: '2m 08s', exitRate: 38.7 }
            ],
            insights: [
                'Organic search traffic increased by 12.5% compared to last period',
                'Social media referrals show strong engagement with lower bounce rates',
                'Blog content continues to drive the highest time-on-page metrics',
                'Mobile traffic conversion rates improved by 8%'
            ],
            recommendations: [
                'Optimize product pages for better mobile experience',
                'Increase content production focusing on top-performing topics',
                'Implement structured data markup for rich search results',
                'Launch retargeting campaign for blog visitors'
            ]
        };
    }
}

module.exports = new PDFService();