// verify-key.js
const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const supabase = require('./lib/supabase');

const tenantId = '3bce31b7-b045-4da0-981c-db138e866cfe';
const testKey = '520c4e257a4611e559151893a06b93a89efbf2388f31d9cfa1c04da0b559739d';
const expectedHash = crypto.createHash('sha256').update(testKey).digest('hex');

console.log('🔑 Key from test:', testKey);
console.log('🔒 Expected SHA256 hash:', expectedHash);

async function check() {
  const { data, error } = await supabase
    .from('tenants')
    .select('api_key_hash')
    .eq('id', tenantId)
    .single();

  if (error) {
    console.error('❌ Database error:', error.message);
    return;
  }

  console.log('📦 Hash stored in database:', data?.api_key_hash);
  
  if (data?.api_key_hash === expectedHash) {
    console.log('✅ PERFECT MATCH! Your key and database hash align.');
    console.log('👉 Run: node test-template-system.js');
  } else {
    console.log('❌ MISMATCH! The key hash does not match the database.');
    console.log('\n🔄 To fix, run this command to update the database:');
    console.log(`node -e "const crypto=require('crypto');const s=require('./lib/supabase');s.from('tenants').update({api_key_hash:'${expectedHash}'}).eq('id','${tenantId}').then(()=>console.log('✅ Hash updated.'));"`);
  }
}

check();