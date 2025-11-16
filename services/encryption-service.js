const bcrypt = require('bcryptjs');

class EncryptionService {
  async encryptSensitiveData(data) {
    const saltRounds = 12;
    return await bcrypt.hash(data, saltRounds);
  }

  async compareSensitiveData(data, encrypted) {
    return await bcrypt.compare(data, encrypted);
  }

  // Simple encryption for SMTP config (for demo - use proper encryption in production)
  encryptSMTPConfig(config) {
    // In production, use proper encryption like crypto
    return Buffer.from(JSON.stringify(config)).toString('base64');
  }

  decryptSMTPConfig(encryptedConfig) {
    try {
      return JSON.parse(Buffer.from(encryptedConfig, 'base64').toString());
    } catch (error) {
      throw new Error('Failed to decrypt SMTP config');
    }
  }
}

module.exports = new EncryptionService();