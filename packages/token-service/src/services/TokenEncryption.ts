import crypto from 'crypto';

export class TokenEncryption {
  encrypt(data: Record<string, unknown>, key: string): { encrypted: string; iv: string; tag: string } {
    const derivedKey = crypto.createHash('sha256').update(key).digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return { encrypted, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
  }

  decrypt(data: { encrypted: string; iv: string; tag: string }, key: string): Record<string, unknown> {
    const derivedKey = crypto.createHash('sha256').update(key).digest();
    const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, Buffer.from(data.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(data.tag, 'base64'));
    let decrypted = decipher.update(data.encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  }
}
