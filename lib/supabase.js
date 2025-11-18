// lib/supabase.js - OPTIMIZED VERSION
const { createClient } = require('@supabase/supabase-js');

console.log('🔧 Supabase URL present:', !!process.env.SUPABASE_URL);
console.log('🔧 Supabase Service Key present:', !!process.env.SUPABASE_SERVICE_KEY);

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  throw new Error('❌ Missing Supabase environment variables! Check your .env file');
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    db: {
      schema: 'public'
    },
    global: {
      headers: {
        'x-application-name': 'reportflow-backend'
      }
    }
  }
);

// Test the connection
console.log('🚀 Supabase client initialized successfully');

module.exports = supabase;