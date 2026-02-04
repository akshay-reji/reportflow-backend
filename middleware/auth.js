// middleware/auth.js - UPDATED: Simple API key authentication for production
const supabase = require('../lib/supabase');
const crypto = require('crypto');

const authMiddleware = {
  // Middleware to validate tenant via API key
  async validateTenant(req, res, next) {
    try {
      const tenantId = req.headers['x-tenant-id'];
      const apiKey = req.headers['x-api-key'];

      // 1. Check for required headers
      if (!tenantId || !apiKey) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Missing authentication headers. Required: x-tenant-id, x-api-key'
        });
      }

      // 2. Fetch tenant from database (using the correct column names from your schema)
      const { data: tenant, error } = await supabase
        .from('tenants')
        .select('*')
        // .eq('status', 'active') // REMOVED: Your schema doesn't have a 'status' column yet
        .eq('id', tenantId)
        .single();

      if (error || !tenant) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid tenant ID'
        });
      }

      // 3. Verify the API key against the stored hash
      //    This requires the 'api_key_hash' column you just added.
      const providedKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

      // IMPORTANT: Check if the hash column exists for this tenant
      if (!tenant.api_key_hash || providedKeyHash !== tenant.api_key_hash) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid API key'
        });
      }

      // 4. Update last access timestamp (using the new column)
      await supabase
        .from('tenants')
        .update({ last_api_access: new Date().toISOString() })
        .eq('id', tenantId);

      // 5. Attach tenant info to the request for use in routes
      req.tenant = tenant;
      req.tenantId = tenantId;

      next(); // Authentication successful, proceed to the route handler
    } catch (error) {
      console.error('Auth middleware error:', error);
      res.status(500).json({ error: 'Internal authentication server error' });
    }
  }
};

module.exports = authMiddleware;