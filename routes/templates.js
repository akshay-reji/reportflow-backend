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

module.exports = router;