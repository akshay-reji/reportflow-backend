// netlify/functions/server.js - NETLIFY FUNCTION WRAPPER
const serverless = require('serverless-http');
const app = require('../../server'); // Import your main Express app

// Export as Netlify Function
const handler = serverless(app);

exports.handler = async (event, context) => {
  console.log('🚀 Netlify Function called:', event.path);
  
  // Add CORS headers
  const response = await handler(event, context);
  
  // Ensure CORS headers are set
  if (!response.headers) response.headers = {};
  response.headers['Access-Control-Allow-Origin'] = '*';
  response.headers['Access-Control-Allow-Headers'] = 'Content-Type, X-ReportFlow-Signature';
  response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
  
  return response;
};