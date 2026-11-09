import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Constant-time string equality (SECURITY A5). Both sides are hashed first so
 * the buffers always have the same length: `timingSafeEqual` throws on a
 * length mismatch, and an early length check would leak the secret's length.
 */
export function secretsEqual(candidate: string, secret: string): boolean {
  const digest = (value: string): Buffer => createHash('sha256').update(value, 'utf8').digest();
  return timingSafeEqual(digest(candidate), digest(secret));
}
