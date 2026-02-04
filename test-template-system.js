// test-template-system.js - End-to-end test with authentication
const fetch = require('node-fetch');
 // You may need to install: npm install node-fetch

const API_URL = 'http://localhost:3001';
const TENANT_UUID = '3bce31b7-b045-4da0-981c-db138e866cfe';
const CONFIG_ID = 'e51bc18e-a9f4-4501-a33f-6b478b689289';
const API_KEY = '520c4e257a4611e559151893a06b93a89efbf2388f31d9cfa1c04da0b559739d'; // 👈 Use the key from the script above

const headers = {
  'Content-Type': 'application/json',
  'x-tenant-id': TENANT_UUID,
  'x-api-key': API_KEY
};

async function testStep(description, requestFn) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🧪 ${description}`);
  console.log(`${'='.repeat(60)}`);
  try {
    const result = await requestFn();
    console.log('✅ Success');
    if (result.data) console.log(JSON.stringify(result.data, null, 2));
    return result;
  } catch (error) {
    console.log('❌ Failed:', error.message);
    console.log(error.cause)
    return null;
  }
}

(async () => {
  console.log('🚀 Starting ReportFlow Template System E2E Test\n');

  // 1. Health Check (public endpoint)
  await testStep('1. Public Health Check', async () => {
    const res = await fetch(`${API_URL}/api/health`);
    return { status: res.status, data: await res.json() };
  });

  // 2. Create a Template (protected endpoint)
  const createResult = await testStep('2. Create Template', async () => {
    const body = {
      name: 'E2E Test Template',
      html_content: '<!DOCTYPE html><html><head><title>{{client_name}} Report</title><style>body{font-family: sans-serif; padding: 2em;} .header{background: #2563eb; color: white; padding: 1em;}</style></head><body><div class="header"><h1>Report for {{client_name}}</h1><p>Date: {{formatDate generated_at}}</p></div><main>{{#each metrics}}<div><strong>{{this.name}}:</strong> {{this.value}}</div>{{/each}}</main></body></html>',
      category: 'analytics'
    };
    const res = await fetch(`${API_URL}/api/templates`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    return { status: res.status, data: await res.json() };
  });

  if (!createResult || !createResult.data.template) {
    console.log('\n⚠️  Template creation failed. Stopping test.');
    process.exit(1);
  }

  const templateId = createResult.data.template.id;
  console.log(`   📝 Template ID: ${templateId}`);

  // 3. Activate the Template
  await testStep('3. Activate Template', async () => {
    const res = await fetch(`${API_URL}/api/templates/${templateId}/activate`, {
      method: 'PUT',
      headers
    });
    return { status: res.status, data: await res.json() };
  });

  // 4. Generate a Report using the Template
  await testStep('4. Generate Report', async () => {
    const body = {
      tenant_id: TENANT_UUID,
      report_config_id: CONFIG_ID,
      template_id: templateId,
      data: { // Mock data for the template
        client_name: 'Acme Corp',
        generated_at: new Date().toISOString(),
        metrics: [
          { name: 'Monthly Users', value: 12500 },
          { name: 'Growth', value: '15%' }
        ]
      }
    };
    const res = await fetch(`${API_URL}/api/reporter/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    return { status: res.status, data: await res.json() };
  });

  console.log('\n' + '='.repeat(60));
  console.log('🎉 End-to-End Test Sequence Complete');
  console.log('='.repeat(60));
})();