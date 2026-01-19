// middleware/auth.js - Production-grade authentication middleware
const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');

class AuthMiddleware {
  constructor() {
    this.JWT_SECRET = process.env.JWT_SECRET || 'reportflow-production-secret-change-in-production';
  }

  // Generate JWT token for tenant
  generateToken(tenant) {
    return jwt.sign(
      {
        tenant_id: tenant.id,
        tenant_name: tenant.name,
        email: tenant.email,
        role: 'tenant_admin'
      },
      this.JWT_SECRET,
      { expiresIn: '7d' }
    );
  }

  // Verify JWT token middleware
  async verifyToken(req, res, next) {
    try {
      // Get token from Authorization header
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

      if (!token) {
        // Fallback to x-tenant-id for development (but warn)
        const tenantId = req.headers['x-tenant-id'];
        if (tenantId && process.env.NODE_ENV === 'development') {
          console.warn('⚠️ Using x-tenant-id header for authentication (development only)');
          const { data: tenant } = await supabase
            .from('tenants')
            .select('*')
            .eq('id', tenantId)
            .eq('status', 'active')
            .single();

          if (!tenant) {
            return res.status(401).json({ error: 'Invalid tenant' });
          }

          req.tenant = tenant;
          req.tenantId = tenantId;
          req.user = { role: 'tenant_admin' };
          return next();
        }
        
        return res.status(401).json({ error: 'Access token required' });
      }

      // Verify JWT token
      const decoded = jwt.verify(token, this.JWT_SECRET);
      
      // Verify tenant exists and is active
      const { data: tenant, error } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', decoded.tenant_id)
        .eq('status', 'active')
        .single();

      if (error || !tenant) {
        return res.status(401).json({ error: 'Invalid or inactive tenant' });
      }

      // Attach tenant and user info to request
      req.tenant = tenant;
      req.tenantId = decoded.tenant_id;
      req.user = {
        id: decoded.tenant_id,
        email: decoded.email,
        role: decoded.role
      };

      next();
    } catch (error) {
      if (error.name === 'JsonWebTokenError') {
        return res.status(403).json({ error: 'Invalid token' });
      }
      if (error.name === 'TokenExpiredError') {
        return res.status(403).json({ error: 'Token expired' });
      }
      console.error('Auth middleware error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Admin-only middleware
  requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  }

  // Tenant user middleware (regular tenant users)
  requireTenantUser(req, res, next) {
    const allowedRoles = ['tenant_admin', 'tenant_user'];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Tenant access required' });
    }
    next();
  }
}

module.exports = new AuthMiddleware();