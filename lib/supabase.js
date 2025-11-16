// lib/supabase.js - CORRECTED VERSION
const { createClient } = require('@supabase/supabase-js');

// Debug: Check if environment variables are loaded
console.log('🔧 Supabase URL present:', !!process.env.SUPABASE_URL);
console.log('🔧 Supabase Service Key present:', !!process.env.SUPABASE_SERVICE_KEY);

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  throw new Error('❌ Missing Supabase environment variables! Check your .env file');
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Test the connection
console.log('🚀 Supabase client initialized successfully');

module.exports = supabase;