import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { requireEnv } from './env.js';

function encryptionKey(): Buffer {
  const raw = requireEnv('ENCRYPTION_KEY');
  const key = /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw);
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be 32 bytes. Prefer a 64-character hex string.');
  }
  return key;
}

export function encrypt(text: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString('base64url')).join('.');
}

export function decrypt(encrypted: string): string {
  const [ivRaw, tagRaw, payloadRaw] = encrypted.split('.');
  if (!ivRaw || !tagRaw || !payloadRaw) {
    throw new Error('Invalid encrypted payload format.');
  }

  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payloadRaw, 'base64url')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
