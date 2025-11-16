// netlify/functions/server.js - NETLIFY FUNCTION WRAPPER
const serverless = require('serverless-http');
const app = require('../../server'); // Import your main Express app

// Export as Netlify Function
exports.handler = serverless(app);