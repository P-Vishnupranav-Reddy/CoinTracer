const crypto = require('crypto');
const config = require('../config/config');

class EncryptionUtil {
  static getKey() {
    const key = config.encryptionKey;

    if (!key) {
      throw new Error('ENCRYPTION_KEY is missing in your .env file');
    }

    // Detect if it's hex or plain text
    const keyBuffer = /^[0-9a-fA-F]+$/.test(key)
      ? Buffer.from(key, 'hex') // HEX string (recommended)
      : Buffer.from(key, 'utf8'); // fallback to utf8

    if (keyBuffer.length !== 32) {
      throw new Error(
        `Invalid ENCRYPTION_KEY length: ${keyBuffer.length} bytes. Must be exactly 32 bytes (64 hex chars).`
      );
    }

    return keyBuffer;
  }

  static encrypt(text) {
    if (typeof text !== 'string') {
      throw new Error('Encryption input must be a string');
    }

    const iv = crypto.randomBytes(16);
    const key = this.getKey();

    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return `${iv.toString('hex')}:${encrypted}`;
  }

  static decrypt(encryptedText) {
    if (!encryptedText || typeof encryptedText !== 'string') {
      throw new Error('Invalid encrypted text');
    }

    const [ivHex, encryptedData] = encryptedText.split(':');
    if (!ivHex || !encryptedData) {
      throw new Error('Malformed encrypted text');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const key = this.getKey();

    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}

module.exports = EncryptionUtil;
