-- Create tenant_templates table
CREATE TABLE IF NOT EXISTS tenant_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  html_content TEXT NOT NULL,
  css_content TEXT,
  is_active BOOLEAN DEFAULT false,
  is_system_template BOOLEAN DEFAULT false, -- For your default templates
  thumbnail_url TEXT,
  category VARCHAR(100) DEFAULT 'analytics',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(tenant_id, name),
  CONSTRAINT only_one_active_per_tenant CHECK (
    NOT is_active OR (
      is_active AND (
        SELECT COUNT(*)
        FROM tenant_templates tt2
        WHERE tt2.tenant_id = tenant_templates.tenant_id
        AND tt2.is_active = true
        AND tt2.id != tenant_templates.id
      ) = 0
    )
  )
);

-- Create index for fast tenant lookups
CREATE INDEX idx_tenant_templates_tenant_id ON tenant_templates(tenant_id);
CREATE INDEX idx_tenant_templates_active ON tenant_templates(tenant_id, is_active) WHERE is_active = true;

-- Insert your current template as a system template
INSERT INTO tenant_templates (tenant_id, name, description, html_content, is_active, is_system_template, category)
SELECT 
  '00000000-0000-0000-0000-000000000000', -- Special UUID for system templates
  'Standard Analytics',
  'Default analytics report template with charts and insights',
  pg_read_file('templates/analytics-report.html')::TEXT,
  true,
  true,
  'analytics'
WHERE EXISTS (SELECT 1 FROM pg_stat_file('templates/analytics-report.html'));