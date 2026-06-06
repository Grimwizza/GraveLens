/* eslint-disable */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Load .env.local
const envPath = path.join(__dirname, '..', '.env.local');
if (!fs.existsSync(envPath)) {
  console.error('Error: .env.local file not found');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] ? match[2].trim() : '';
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.substring(1, value.length - 1);
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.substring(1, value.length - 1);
    }
    env[match[1]] = value;
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL not found in .env.local');
  process.exit(1);
}

if (!serviceRoleKey) {
  console.log('----------------------------------------------------');
  console.log('SUPABASE_SERVICE_ROLE_KEY is not defined in .env.local');
  console.log('To clear the cache automatically:');
  console.log('1. Get your service_role API key from the Supabase Dashboard.');
  console.log('2. Add it to .env.local as SUPABASE_SERVICE_ROLE_KEY=your_key');
  console.log('3. Run this script again.');
  console.log('\nAlternatively, you can run this SQL query directly in your Supabase SQL Editor:');
  console.log('   TRUNCATE public.cemetery_cache;');
  console.log('----------------------------------------------------');
  process.exit(0);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false
  }
});

async function run() {
  console.log('Attempting to clear cemetery_cache table...');
  const { error } = await supabase
    .from('cemetery_cache')
    .delete()
    .neq('osm_id', 'keep_none_placeholder'); // deletes all rows

  if (error) {
    console.error('Error deleting rows:', error.message);
    process.exit(1);
  }

  console.log('✅ Success! cemetery_cache table cleared.');
}

run();
