// scripts/generate-test-key.js - ADD dotenv config
const crypto = require('crypto');
const path = require('path');

// ⚠️ CRITICAL: Load environment variables BEFORE requiring supabase.js
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Now it's safe to load the Supabase client
const supabase = require(path.join(__dirname, '..', 'lib', 'supabase'));

async function generateAndStoreKey(tenantId) {
    // ... rest of your function stays the same ...
  const apiKey = crypto.randomBytes(32).toString('hex');
  console.log('🔐 Generated NEW API Key (SAVE THIS IMMEDIATELY!):', apiKey);

  const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

  const { error } = await supabase
    .from('tenants')
    .update({ api_key_hash: apiKeyHash })
    .eq('id', tenantId);

  if (error) {
    console.error('❌ Failed to store key hash:', error.message);
  } else {
    console.log('✅ API key hash stored for tenant:', tenantId);
    console.log('⚠️  Save the raw key above now. It will not be shown again.');
  }
}

// Use your actual tenant UUID
const YOUR_TENANT_UUID = '3bce31b7-b045-4da0-981c-db138e866cfe';
generateAndStoreKey(YOUR_TENANT_UUID).catch(console.error);