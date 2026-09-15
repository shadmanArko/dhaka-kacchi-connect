import { randomBytes, randomInt, timingSafeEqual, createHash } from "node:crypto";
import bcrypt from "bcryptjs";

/**
 * Pure auth primitives - password hashing, OTP codes, session tokens. No
 * database, no HTTP, mirroring how orders.ts is pure logic kept separate
 * from ordersRepository.ts. Business constants (TTLs, attempt limits) live
 * here as plain named values, not config/env vars - same reasoning as
 * dates.ts's hardcoded CUTOFF_HOUR: these are business rules, not
 * per-deployment settings.
 */

// Small enough to be imperceptible to a human logging in, large enough to
// meaningfully slow offline brute force if the database ever leaked. This
// app's scale (~24 orders/day) never makes hashing latency a bottleneck.
const BCRYPT_COST_FACTOR = 12;

export const OTP_LENGTH = 6;
export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_MAX_SENDS_PER_PHONE_PER_HOUR = 3;
export const OTP_MAX_SENDS_PER_PHONE_PER_DAY = 10;
export const OTP_MAX_SENDS_PER_IP_PER_HOUR = 10;

export const SESSION_TTL_DAYS = 30;
// Shorter than a customer session, given admin sessions carry a much
// higher blast radius (discounts, order status, staff order creation).
export const ADMIN_SESSION_TTL_DAYS = 7;

export const PASSWORD_RESET_TTL_MINUTES = 60;

export const LOGIN_MAX_FAILED_ATTEMPTS = 5;
export const LOGIN_LOCKOUT_MINUTES = 15;
export const LOGIN_MAX_ATTEMPTS_PER_IP_PER_10MIN = 20;

/** Hashes a plaintext password for storage. Never store the raw password. */
export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST_FACTOR);
}

/** Checks a plaintext password against a stored bcrypt hash. */
export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Generates a random 6-digit OTP code, CSPRNG-backed (not Math.random()). */
export function generateOtpCode(): string {
  return randomInt(0, 10 ** OTP_LENGTH)
    .toString()
    .padStart(OTP_LENGTH, "0");
}

/** SHA-256 of an OTP code, for storage - fast on purpose: the code's
 * keyspace (1 in a million) is already bounded by OTP_MAX_ATTEMPTS, so
 * bcrypt's deliberate slowness (built for a much larger password keyspace)
 * isn't the right tool here, just an unnecessary cost. */
export function hashOtpCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/** Timing-safe comparison of an OTP/token against its stored hash - never
 * compare secret-derived hex strings with `===`. */
export function hashesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/** A random, unguessable bearer token (256 bits) for a login session. */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** A random, unguessable token for a password-reset link. */
export function generatePasswordResetToken(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 of a bearer/reset token, for storage - the raw token is never
 * stored, only ever held by the client that received it. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const E164_PATTERN = /^\+[1-9]\d{6,14}$/;

/** True if `phone` is in E.164 form (e.g. "+491701234567") - required
 * before it's ever used as a rate-limit/uniqueness key, so "+49 30 1234",
 * "030 1234", and "0049301234" are never silently treated as three
 * different identifiers. */
export function isE164(phone: string): boolean {
  return E164_PATTERN.test(phone);
}
