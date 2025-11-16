const chromium = require('chrome-aws-lambda');
const handlebars = require('handlebars');
const fs = require('fs').promises;
const path = require('path');

// Register Handlebars helpers
handlebars.registerHelper('formatNumber', function(number) {
    if (!number) return '0';
    return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
});

class PDFService {
    constructor() {
        this.templateCache = new Map();
    }

    async generateProfessionalPDF(templateData) {
        let browser = null;
        try {
            // Load and compile template
            const htmlContent = await this.compileTemplate('analytics-report', templateData);
            
            // Launch browser for PDF generation
            browser = await chromium.puppeteer.launch({
                args: chromium.args,
                defaultViewport: chromium.defaultViewport,
                executablePath: await chromium.executablePath,
                headless: chromium.headless,
                ignoreHTTPSErrors: true,
            });

            const page = await browser.newPage();
            
            // Set professional PDF options
            await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
            
            const pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: {
                    top: '20mm',
                    right: '15mm',
                    bottom: '20mm',
                    left: '15mm'
                },
                displayHeaderFooter: false,
                preferCSSPageSize: true
            });

            await browser.close();
            return pdfBuffer;

        } catch (error) {
            if (browser) await browser.close();
            throw new Error(`PDF generation failed: ${error.message}`);
        }
    }

    async compileTemplate(templateName, data) {
        // Check cache first
        if (this.templateCache.has(templateName)) {
            const template = this.templateCache.get(templateName);
            return template(data);
        }

        try {
            // Load base template
            const baseTemplatePath = path.join(__dirname, '../templates/base.html');
            let baseTemplate = await fs.readFile(baseTemplatePath, 'utf8');
            
            // Load specific template
            const specificTemplatePath = path.join(__dirname, `../templates/${templateName}.html`);
            let specificTemplate = await fs.readFile(specificTemplatePath, 'utf8');
            
            // Combine templates
            const fullTemplate = baseTemplate.replace('{{{content}}}', specificTemplate);
            
            // Compile and cache
            const template = handlebars.compile(fullTemplate);
            this.templateCache.set(templateName, template);
            
            return template(data);
        } catch (error) {
            throw new Error(`Template compilation failed: ${error.message}`);
        }
    }

    // Mock data generator for testing (replace with real API calls)
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