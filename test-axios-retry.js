// Create test-axios-retry.js in your project root
const retry = require('axios-retry');
console.log('axios-retry exports:', retry);
console.log('Is function?', typeof retry);
console.log('Has default?', retry.default ? 'Yes' : 'No');