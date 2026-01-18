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

    generateProfessionalPDF(templateData) {
    // 检查是否有自定义模板内容
    if (templateData.template_html) {
        // 使用自定义模板
        return this.generatePDFFromTemplate(
            templateData.template_html,
            templateData,
            templateData.template_css
        );
    } else {
        // 使用默认模板
        return this.generatePDFFromFile(
            'templates/analytics-report.html',
            templateData
        );
    }
}

    async compileTemplate(templateName, data) {
        // Check cache first
        if (this.templateCache.has(templateName)) {
            const template = this.templateCache.get(templateName);
            return template(data);
        }

        try {
            // ✅ FIX: Use process.cwd() for Netlify Functions compatibility
            const projectRoot = process.cwd();
            console.log(`🔍 Project root: ${projectRoot}`);
            
            // Try multiple possible template locations for Netlify
            const possibleBasePaths = [
                path.join(projectRoot, 'templates', 'base.html'),
                path.join(projectRoot, 'src', 'templates', 'base.html'),
                path.join(__dirname, '..', 'templates', 'base.html'),
                path.join(__dirname, '..', '..', 'templates', 'base.html')
            ];

            let baseTemplate = '';
            let baseTemplatePath = '';

            // Find the base template
            for (const basePath of possibleBasePaths) {
                try {
                    baseTemplate = await fs.readFile(basePath, 'utf8');
                    baseTemplatePath = basePath;
                    console.log(`✅ Found base template at: ${basePath}`);
                    break;
                } catch (e) {
                    // Continue to next path
                }
            }

            if (!baseTemplate) {
                throw new Error(`Base template not found in any location: ${possibleBasePaths.join(', ')}`);
            }

            // Try multiple possible specific template locations
            const possibleSpecificPaths = [
                path.join(projectRoot, 'templates', `${templateName}.html`),
                path.join(projectRoot, 'src', 'templates', `${templateName}.html`),
                path.join(__dirname, '..', 'templates', `${templateName}.html`),
                path.join(__dirname, '..', '..', 'templates', `${templateName}.html`)
            ];

            let specificTemplate = '';
            let specificTemplatePath = '';

            // Find the specific template
            for (const specificPath of possibleSpecificPaths) {
                try {
                    specificTemplate = await fs.readFile(specificPath, 'utf8');
                    specificTemplatePath = specificPath;
                    console.log(`✅ Found ${templateName} template at: ${specificPath}`);
                    break;
                } catch (e) {
                    // Continue to next path
                }
            }

            if (!specificTemplate) {
                throw new Error(`${templateName} template not found in any location`);
            }

            // Combine templates
            const fullTemplate = baseTemplate.replace('{{{content}}}', specificTemplate);
            
            // Compile and cache
            const template = handlebars.compile(fullTemplate);
            this.templateCache.set(templateName, template);
            
            return template(data);
        } catch (error) {
            console.error('❌ Template compilation failed, using fallback template:', error);
            
            // Fallback template if files can't be found
            const fallbackTemplate = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        .header { background: #2c5aa0; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; }
        .footer { text-align: center; margin-top: 40px; color: #666; }
    </style>
</head>
<body>
    <div class="header">
        <h1>${data.reportTitle || 'Analytics Report'}</h1>
        <p>Prepared for ${data.clientName || 'Client'} by ${data.agencyName || 'Agency'}</p>
    </div>
    <div class="content">
        <h2>Executive Summary</h2>
        <p>Report period: ${data.periodStart || 'N/A'} to ${data.periodEnd || 'N/A'}</p>
        <p>This is a fallback report template. The main templates could not be loaded.</p>
        
        <h2>Key Metrics</h2>
        <p>Total Visitors: ${data.metrics?.totalVisitors || 'N/A'}</p>
        <p>Page Views: ${data.metrics?.pageViews || 'N/A'}</p>
        
        <p><em>Note: This is a simplified fallback template for testing.</em></p>
    </div>
    <div class="footer">
        <p>Generated by ReportFlow on ${new Date().toLocaleDateString()}</p>
    </div>
</body>
</html>`;
            
            const template = handlebars.compile(fallbackTemplate);
            return template(data);
        }
    }

    // Mock data generator for testing
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