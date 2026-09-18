import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

export function generateTemporaryPassword() {
  return randomBytes(18).toString('base64url');
}

export function validatePasswordStrength(password: string) {
  if (password.length < 12) throw new Error('Password must be at least 12 characters');
  if (password.length > 256) throw new Error('Password is too long');
}

export async function hashPassword(password: string) {
  validatePasswordStrength(password);
  const salt = randomBytes(16).toString('hex');
  const derived = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, encoded: string | null | undefined) {
  if (!encoded) return false;
  const [scheme, salt, expectedHex] = encoded.split('$');
  if (scheme !== 'scrypt' || !salt || !expectedHex) return false;
  try {
    const actual = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
    const expected = Buffer.from(expectedHex, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
