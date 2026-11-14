/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Authentication primitives: password hashing (scrypt), signed session
 * tokens (HMAC-SHA256), temporary password generation and login throttling.
 * Uses only Node's built-in crypto module, so there are no native deps.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Password hashing
// ---------------------------------------------------------------------------

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 32;
const HASH_PREFIX = 'scrypt$';

export function isPasswordHash(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(HASH_PREFIX);
}

export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(plain, salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `${HASH_PREFIX}${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

// Used to keep response timing similar when the username does not exist.
const DUMMY_HASH = hashPassword(crypto.randomBytes(16).toString('hex'));

/**
 * Verifies a password against a stored value. Accepts scrypt hashes and,
 * for migration only, legacy plaintext values (callers should re-hash on
 * success, see `needsRehash`).
 */
export function verifyPassword(plain: unknown, stored: string | undefined | null): boolean {
  if (typeof plain !== 'string' || plain.length === 0) {
    verifyAgainstHash('x', DUMMY_HASH);
    return false;
  }
  if (!stored) {
    verifyAgainstHash(plain, DUMMY_HASH);
    return false;
  }
  if (isPasswordHash(stored)) {
    return verifyAgainstHash(plain, stored);
  }
  // Legacy plaintext value
  const a = crypto.createHash('sha256').update(plain).digest();
  const b = crypto.createHash('sha256').update(stored).digest();
  return crypto.timingSafeEqual(a, b);
}

function verifyAgainstHash(plain: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6) return false;
  const [, nStr, rStr, pStr, saltB64, keyB64] = parts;
  const N = parseInt(nStr, 10);
  const r = parseInt(rStr, 10);
  const p = parseInt(pStr, 10);
  if (!N || !r || !p) return false;
  const expected = Buffer.from(keyB64, 'base64url');
  const actual = crypto.scryptSync(plain, Buffer.from(saltB64, 'base64url'), expected.length, { N, r, p });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function needsRehash(stored: string | undefined | null): boolean {
  return !!stored && !isPasswordHash(stored);
}

/** Returns an error message if the password is too weak, otherwise null. */
export function validatePasswordStrength(pw: unknown): string | null {
  if (typeof pw !== 'string' || pw.length < 8) return 'Password must be at least 8 characters long.';
  if (pw.length > 128) return 'Password must be at most 128 characters long.';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Password must contain at least one letter and one number.';
  return null;
}

/** Random, human-friendly temporary password (no ambiguous characters). */
export function generateTempPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const all = upper + lower + digits;
  const pick = (set: string) => set[crypto.randomInt(set.length)];
  const chars = [pick(upper), pick(lower), pick(digits)];
  while (chars.length < 12) chars.push(pick(all));
  // Fisher-Yates shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

// ---------------------------------------------------------------------------
// Session tokens
// ---------------------------------------------------------------------------

let tokenSecret: Buffer | null = null;

/**
 * Loads the token signing secret from AUTH_SECRET, or from (creating if
 * needed) a secret file in the data directory so sessions survive restarts.
 */
export function initAuthSecret(dataDir: string): void {
  const fromEnv = process.env.AUTH_SECRET;
  if (fromEnv && fromEnv.length >= 32) {
    tokenSecret = Buffer.from(fromEnv, 'utf8');
    return;
  }
  if (fromEnv) {
    console.warn('⚠️ AUTH_SECRET is set but shorter than 32 characters; ignoring it.');
  }
  const secretFile = path.join(dataDir, '.auth-secret');
  try {
    if (fs.existsSync(secretFile)) {
      const content = fs.readFileSync(secretFile, 'utf8').trim();
      if (content.length >= 32) {
        tokenSecret = Buffer.from(content, 'utf8');
        return;
      }
    }
    const generated = crypto.randomBytes(48).toString('base64url');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(secretFile, generated, { mode: 0o600 });
    tokenSecret = Buffer.from(generated, 'utf8');
    console.warn(`⚠️ AUTH_SECRET not set. Generated a signing secret at ${secretFile}. Set AUTH_SECRET in production (required when running more than one instance).`);
  } catch (err) {
    tokenSecret = crypto.randomBytes(48);
    console.warn('⚠️ AUTH_SECRET not set and secret file could not be written; using an in-memory secret. All sessions end when the server restarts.', err);
  }
}

export interface TokenPayload {
  sub: string; // user id
  tv: number;  // user token version (bumped to revoke sessions)
  iat: number;
  exp: number;
}

export const TOKEN_TTL_SECONDS = parseInt(process.env.AUTH_TOKEN_TTL_SECONDS || '', 10) || 12 * 60 * 60;

function sign(data: string): string {
  if (!tokenSecret) throw new Error('Auth secret not initialized');
  return crypto.createHmac('sha256', tokenSecret).update(data).digest('base64url');
}

export function issueToken(userId: string, tokenVersion: number): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: TokenPayload = { sub: userId, tv: tokenVersion, iat: now, exp: now + TOKEN_TTL_SECONDS };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `v1.${body}.${sign(`v1.${body}`)}`;
}

export function verifyToken(token: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return null;
  const expected = Buffer.from(sign(`v1.${parts[1]}`));
  const actual = Buffer.from(parts[2]);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as TokenPayload;
    if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number') return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Login throttling (in-memory, per IP + username)
// ---------------------------------------------------------------------------

const MAX_FAILED_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;
const failedAttempts = new Map<string, { count: number; firstAt: number }>();

function throttleKey(ip: string, username: string) {
  return `${ip}|${username.toLowerCase()}`;
}

/** Returns seconds until retry is allowed, or 0 if the attempt may proceed. */
export function loginRetryAfter(ip: string, username: string): number {
  const entry = failedAttempts.get(throttleKey(ip, username));
  if (!entry) return 0;
  const elapsed = Date.now() - entry.firstAt;
  if (elapsed > WINDOW_MS) {
    failedAttempts.delete(throttleKey(ip, username));
    return 0;
  }
  return entry.count >= MAX_FAILED_ATTEMPTS ? Math.ceil((WINDOW_MS - elapsed) / 1000) : 0;
}

export function recordLoginFailure(ip: string, username: string): void {
  const key = throttleKey(ip, username);
  const entry = failedAttempts.get(key);
  if (!entry || Date.now() - entry.firstAt > WINDOW_MS) {
    failedAttempts.set(key, { count: 1, firstAt: Date.now() });
  } else {
    entry.count++;
  }
  // Prevent unbounded growth
  if (failedAttempts.size > 10000) {
    const cutoff = Date.now() - WINDOW_MS;
    for (const [k, v] of failedAttempts) if (v.firstAt < cutoff) failedAttempts.delete(k);
  }
}

export function clearLoginFailures(ip: string, username: string): void {
  failedAttempts.delete(throttleKey(ip, username));
}

// ---------------------------------------------------------------------------
// Response sanitising
// ---------------------------------------------------------------------------

/** Keys that must never be serialised in an API response. */
export const SECRET_RESPONSE_KEYS = new Set(['password', 'tokenVersion']);

/** JSON replacer for express's `json replacer` setting. */
export function secretStrippingReplacer(key: string, value: unknown) {
  return SECRET_RESPONSE_KEYS.has(key) ? undefined : value;
}
