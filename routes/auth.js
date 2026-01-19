// routes/auth.js - Tenant authentication routes
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

// Tenant registration (for admin use)
router.post('/register', [
  body('name').notEmpty().trim(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('plan').isIn(['starter', 'pro', 'enterprise'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, password, plan } = req.body;

    // Check if tenant already exists
    const { data: existingTenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('email', email)
      .single();

    if (existingTenant) {
      return res.status(409).json({ error: 'Tenant already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create tenant
    const { data: tenant, error } = await supabase
      .from('tenants')
      .insert({
        name,
        email,
        password_hash: hashedPassword,
        status: 'active',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    // Create default subscription
    const { error: subscriptionError } = await supabase
      .from('tenant_subscriptions')
      .insert({
        tenant_id: tenant.id,
        plan_id: plan,
        status: 'active',
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      });

    if (subscriptionError) throw subscriptionError;

    // Generate JWT token
    const token = authMiddleware.generateToken(tenant);

    res.status(201).json({
      message: 'Tenant registered successfully',
      tenant: {
        id: tenant.id,
        name: tenant.name,
        email: tenant.email,
        status: tenant.status
      },
      token,
      expires_in: '7 days'
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Tenant login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    // Get tenant with password hash
    const { data: tenant, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('email', email)
      .eq('status', 'active')
      .single();

    if (error || !tenant) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, tenant.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = authMiddleware.generateToken(tenant);

    // Update last login
    await supabase
      .from('tenants')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', tenant.id);

    res.json({
      message: 'Login successful',
      tenant: {
        id: tenant.id,
        name: tenant.name,
        email: tenant.email
      },
      token,
      expires_in: '7 days'
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current tenant profile
router.get('/profile', authMiddleware.verifyToken, async (req, res) => {
  try {
    const { data: subscription } = await supabase
      .from('tenant_subscriptions')
      .select('*')
      .eq('tenant_id', req.tenantId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    res.json({
      tenant: req.tenant,
      subscription: subscription || null,
      user: req.user
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

module.exports = router;