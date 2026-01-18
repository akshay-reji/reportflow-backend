-- Function to safely activate a template (ensures only one active per tenant)
CREATE OR REPLACE FUNCTION activate_tenant_template(
  p_tenant_id UUID,
  p_template_id UUID
)
RETURNS SETOF tenant_templates AS $$
BEGIN
  -- Verify template belongs to tenant (or is system template)
  IF NOT EXISTS (
    SELECT 1 FROM tenant_templates 
    WHERE id = p_template_id 
    AND (tenant_id = p_tenant_id OR is_system_template = true)
  ) THEN
    RAISE EXCEPTION 'Template not found or access denied';
  END IF;

  -- Deactivate all other templates for this tenant
  UPDATE tenant_templates
  SET is_active = false, updated_at = NOW()
  WHERE tenant_id = p_tenant_id 
  AND id != p_template_id
  AND is_system_template = false;

  -- Activate the requested template
  UPDATE tenant_templates
  SET is_active = true, updated_at = NOW()
  WHERE id = p_template_id;

  -- Return the updated template
  RETURN QUERY
  SELECT * FROM tenant_templates 
  WHERE id = p_template_id;
END;
$$ LANGUAGE plpgsql;