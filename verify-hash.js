// verify-hash.js
const crypto = require('crypto');

const apiKeyFromTest = '70ec2d9db5327c229a72f96c5739a60503f497b083278ba0000f01e29b3620e6';
const hashFromTestKey = crypto.createHash('sha256').update(apiKeyFromTest).digest('hex');

console.log('Key from your test script:', apiKeyFromTest);
console.log('SHA256 Hash of that key:', hashFromTestKey);
console.log('Hash to check in database:', hashFromTestKey);