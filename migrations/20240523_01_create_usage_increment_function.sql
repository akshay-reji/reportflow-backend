-- Migration: Create function to safely increment usage counters
CREATE OR REPLACE FUNCTION increment_usage(
  p_tenant_id UUID,
  p_month DATE,
  p_column_name TEXT,
  p_increment_amount INTEGER DEFAULT 1
)
RETURNS void AS $$
BEGIN
  EXECUTE format(
    'INSERT INTO tenant_usage (tenant_id, month, %I, created_at, updated_at)
     VALUES ($1, $2, $3, NOW(), NOW())
     ON CONFLICT (tenant_id, month)
     DO UPDATE SET %I = tenant_usage.%I + EXCLUDED.%I, updated_at = NOW()',
    p_column_name,
    p_column_name,
    p_column_name,
    p_column_name
  )
  USING p_tenant_id, p_month, p_increment_amount;
END;
$$ LANGUAGE plpgsql;