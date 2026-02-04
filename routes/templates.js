const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { body, validationResult } = require('express-validator');
const { checkUsage } = require('../middleware/usage-limits');

// Get all templates for a tenant (including system templates)
router.get('/', checkUsage, async (req, res) => {
  try {
    const tenantId = req.tenantId || req.headers['x-tenant-id'];
    
    const { data: templates, error } = await supabase
      .from('tenant_templates')
      .select('*')
      .or(`tenant_id.eq.${tenantId},is_system_template.eq.true`)
      .order('is_system_template', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      templates,
      count: templates.length
    });
  } catch (error) {
    console.error('Template list error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch templates'
    });
  }
});

// Create a new template
router.post('/',
  checkUsage,
  [
    body('name').isString().trim().notEmpty().isLength({ max: 255 }),
    body('html_content').isString().notEmpty(),
    body('css_content').optional().isString(),
    body('category').optional().isIn(['analytics', 'marketing', 'executive', 'custom'])
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const tenantId = req.tenantId;
      const { name, description, html_content, css_content, category } = req.body;

      // Validate HTML for security (basic check)
      if (html_content.includes('<script>') || html_content.includes('javascript:')) {
        return res.status(400).json({
          success: false,
          error: 'HTML content cannot contain JavaScript for security reasons'
        });
      }

      const { data: template, error } = await supabase
        .from('tenant_templates')
        .insert({
          tenant_id: tenantId,
          name,
          description,
          html_content,
          css_content,
          category: category || 'analytics',
          is_active: false // New templates aren't active by default
        })
        .select()
        .single();

      if (error) throw error;

      res.status(201).json({
        success: true,
        message: 'Template created successfully',
        template
      });
    } catch (error) {
      console.error('Template creation error:', error);
      
      if (error.code === '23505') {
        return res.status(409).json({
          success: false,
          error: 'A template with this name already exists'
        });
      }
      
      res.status(500).json({
        success: false,
        error: 'Failed to create template'
      });
    }
  }
);

// Update a template
router.put('/:id',
  checkUsage,
  [
    body('name').optional().isString().trim().notEmpty(),
    body('html_content').optional().isString().notEmpty()
  ],
  async (req, res) => {
    try {
      const tenantId = req.tenantId;
      const templateId = req.params.id;
      const updates = req.body;

      // Validate ownership
      const { data: existingTemplate, error: fetchError } = await supabase
        .from('tenant_templates')
        .select('*')
        .eq('id', templateId)
        .eq('tenant_id', tenantId)
        .single();

      if (fetchError || !existingTemplate) {
        return res.status(404).json({
          success: false,
          error: 'Template not found or access denied'
        });
      }

      // System templates can only be copied, not modified
      if (existingTemplate.is_system_template) {
        return res.status(403).json({
          success: false,
          error: 'System templates cannot be modified. Create a copy instead.'
        });
      }

      const { data: template, error } = await supabase
        .from('tenant_templates')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', templateId)
        .eq('tenant_id', tenantId)
        .select()
        .single();

      if (error) throw error;

      res.json({
        success: true,
        message: 'Template updated successfully',
        template
      });
    } catch (error) {
      console.error('Template update error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update template'
      });
    }
  }
);

// Set a template as active
router.post('/:id/activate', checkUsage, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const templateId = req.params.id;

    // Use a transaction to ensure only one active template
    const { data: templates, error } = await supabase.rpc('activate_tenant_template', {
      p_tenant_id: tenantId,
      p_template_id: templateId
    });

    if (error) throw error;

    res.json({
      success: true,
      message: 'Template activated successfully',
      active_template: templates[0]
    });
  } catch (error) {
    console.error('Template activation error:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: 'Template not found'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to activate template'
    });
  }
});

// Duplicate a template (including system templates)
router.post('/:id/duplicate', checkUsage, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const templateId = req.params.id;
    const { new_name } = req.body;

    const { data: sourceTemplate, error: fetchError } = await supabase
      .from('tenant_templates')
      .select('*')
      .or(`id.eq.${templateId},and(is_system_template.eq.true,id.eq.${templateId})`)
      .single();

    if (fetchError || !sourceTemplate) {
      return res.status(404).json({
        success: false,
        error: 'Template not found'
      });
    }

    const { data: newTemplate, error } = await supabase
      .from('tenant_templates')
      .insert({
        tenant_id: tenantId,
        name: new_name || `${sourceTemplate.name} (Copy)`,
        description: sourceTemplate.description,
        html_content: sourceTemplate.html_content,
        css_content: sourceTemplate.css_content,
        category: sourceTemplate.category,
        is_active: false
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: 'Template duplicated successfully',
      template: newTemplate
    });
  } catch (error) {
    console.error('Template duplication error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to duplicate template'
    });
  }
});

// Delete a template
router.delete('/:id', checkUsage, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const templateId = req.params.id;

    // Prevent deletion of active template
    const { data: template, error: fetchError } = await supabase
      .from('tenant_templates')
      .select('is_active')
      .eq('id', templateId)
      .eq('tenant_id', tenantId)
      .single();

    if (fetchError) {
      return res.status(404).json({
        success: false,
        error: 'Template not found'
      });
    }

    if (template.is_active) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete active template. Activate another template first.'
      });
    }

    const { error } = await supabase
      .from('tenant_templates')
      .delete()
      .eq('id', templateId)
      .eq('tenant_id', tenantId);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Template deleted successfully'
    });
  } catch (error) {
    console.error('Template deletion error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete template'
    });
  }
});

// routes/templates.js - Add this route
router.put('/:id/activate', async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    console.log(`🔍 Activation Attempt: Tenant ${tenantId}, Template ${id}`);

    // 1. Deactivate others
    const deactivateResult = await supabase
      .from('tenant_templates')
      .update({ is_active: false })
      .eq('tenant_id', tenantId)
      .eq('is_active', true);
    console.log('Deactivated others:', deactivateResult);

    // 2. Activate this template
    const { data, error } = await supabase
  .from('tenant_templates')
  .update({ is_active: true, updated_at: new Date().toISOString() })
  .eq('id', id)
  .eq('tenant_id', tenantId)
  .select() // ✅ Add .select() to return the updated rows
  .single();  // ❗ .single() expects exactly ONE row to be returned

    console.log('Activation DB Result - Data:', data, 'Error:', error);

    if (error || !data) {
      return res.status(404).json({ error: 'Template not found or update failed' });
    }

    res.json({ success: true, message: 'Template activated', template: data });
  } catch (error) {
    console.error('Activation error:', error);
    res.status(500).json({ error: 'Activation failed' });
  }
});

// GET /api/templates/variables - Document available template variables
router.get('/variables', (req, res) => {
  res.json({
    variables: {
      // Basic report info
      client_name: "String - Client's company name",
      period: "String - Report period (e.g., 'Q1 2024')",
      generated_at: "Date - ISO string, use {{formatDate generated_at}}",
      
      // Metrics array (loop with {{#each metrics}})
      metrics: [
        {
          name: "String - Metric name",
          value: "Number/String - Metric value",
          change: "Number - Percentage change",
          positive: "Boolean - Whether change is positive"
        }
      ],
      
      // AI Insights
      insights: "Array - AI-generated insights strings",
      recommendations: "Array - AI-generated recommendations",
      
      // Advanced data
      traffic_sources: "Array - Traffic source breakdown",
      top_pages: "Array - Top performing pages"
    },
    
    helpers: {
      formatDate: "Formats ISO date to readable format",
      formatNumber: "Adds commas to large numbers",
      percentage: "Converts decimal to percentage (0.15 → 15%)",
      ifEquals: "Conditional rendering: {{#ifEquals status 'active'}}"
    },
    
    example: `<!DOCTYPE html>
<html>
<body>
  <h1>{{client_name}} Report</h1>
  <p>Period: {{period}}</p>
  {{#each metrics}}
  <div class="metric">
    <h3>{{this.name}}</h3>
    <p>{{formatNumber this.value}}</p>
  </div>
  {{/each}}
</body>
</html>`
  });
});

// POST /api/templates/preview - Preview template with sample data
router.post('/preview', async (req, res) => {
  try {
    const { html_content, css_content, data } = req.body;
    
    // Use your PDF service to generate HTML (not PDF)
    const pdfService = require('../services/pdf-service');
    const handlebars = require('handlebars');
    
    // Compile and render HTML
    const template = handlebars.compile(html_content);
    const renderedHTML = template(data || pdfService.generateMockAnalyticsData());
    
    // Combine with CSS
    const fullHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          ${css_content || ''}
          body { font-family: Arial, sans-serif; padding: 20px; }
        </style>
      </head>
      <body>${renderedHTML}</body>
      </html>
    `;
    
    res.json({ 
      success: true, 
      html: fullHTML,
      warnings: [] // Could add validation warnings here
    });
    
  } catch (error) {
    console.error('Preview error:', error);
    res.status(400).json({ 
      success: false, 
      error: 'Failed to render preview',
      details: error.message 
    });
  }
});

// GET /api/templates/catalog - List available templates
router.get('/catalog', (req, res) => {
  const catalog = [
    {
      id: 'analytics-standard',
      name: 'Analytics Standard',
      description: 'Comprehensive analytics with AI insights',
      file: 'analytics-report.html',
      styles: ['professional', 'minimal', 'dark-mode'],
      category: 'analytics',
      preview_image: '/templates/previews/analytics-standard.png'
    },
    {
      id: 'executive-summary',
      name: 'Executive Summary',
      description: 'C-suite focused with financial metrics',
      file: 'executive-summary.html',
      styles: ['professional', 'minimal'],
      category: 'executive',
      preview_image: '/templates/previews/executive-summary.png'
    },
    {
      id: 'ecommerce-dashboard',
      name: 'E-commerce Dashboard',
      description: 'Product performance and conversion funnel',
      file: 'ecommerce-dashboard.html',
      styles: ['professional', 'creative'],
      category: 'ecommerce',
      preview_image: '/templates/previews/ecommerce-dashboard.png'
    }
  ];
  
  res.json({ success: true, templates: catalog });
});

module.exports = router;