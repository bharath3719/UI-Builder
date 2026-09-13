/**
 * Encryption for stored API credentials.
 *
 * An integration's token is handed to the browser at run time — that is the call path
 * this product chose, and encryption here does not change it. What it buys is the other
 * threat: a database dump, a stray backup, a `SELECT *` in a support session. Those
 * should not be a list of every team's live API keys, and without this they are.
 *
 * AES-256-GCM, because the alternative worth ruling out is a plain cipher plus a separate
 * MAC, which is the same thing assembled by hand and occasionally assembled wrong. GCM's
 * tag is the integrity check, so a truncated or tampered row fails to decrypt rather than
 * yielding plausible garbage that then goes out in an `Authorization` header.
 */

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { env } from '../env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

/**
 * Derived from `JWT_SECRET` when no dedicated key is configured.
 *
 * The repo's premise is that a checkout runs with no third-party keys (D9), and an
 * encryption key is not one — so demanding `INTEGRATION_KEY` before the API will boot
 * would break `git clone && npm run dev` for a feature most checkouts never touch. HKDF
 * with a fixed, distinct `info` gives key separation for free: the derived key cannot be
 * used to mint a JWT and a leaked JWT signing key does not trivially decrypt these rows,
 * even though both descend from the same secret.
 *
 * An operator who wants real separation sets `INTEGRATION_KEY` and gets it. Rotating
 * either one makes existing rows undecryptable — see `decryptSecret`, which reports that
 * as "re-enter the token" rather than as a crash.
 */
function deriveKey(): Buffer {
  if (env.INTEGRATION_KEY) return env.INTEGRATION_KEY;

  return Buffer.from(
    hkdfSync('sha256', env.JWT_SECRET, 'ui-builder/integration-secret', 'aes-256-gcm', KEY_BYTES),
  );
}

/** Computed once: `deriveKey` is pure in `env`, and HKDF per request is pure waste. */
let cachedKey: Buffer | null = null;

function key(): Buffer {
  cachedKey ??= deriveKey();
  return cachedKey;
}

/** Thrown when a stored credential cannot be read back — a rotated key, or a bad row. */
export class SecretUnreadableError extends Error {
  constructor() {
    super('This integration’s stored token could not be decrypted. Enter it again to replace it.');
    this.name = 'SecretUnreadableError';
  }
}

/**
 * `iv || tag || ciphertext`, which is what the `secretCipher` column holds.
 *
 * Returned as a plain `Uint8Array` rather than a `Buffer`: Prisma's `Bytes` is typed
 * `Uint8Array<ArrayBuffer>`, and a `Buffer` is a `Uint8Array<ArrayBufferLike>` — which
 * admits `SharedArrayBuffer` and so is not assignable. The copy is a few dozen bytes.
 */
export function encryptSecret(plaintext: string): Uint8Array<ArrayBuffer> {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

  return new Uint8Array(Buffer.concat([iv, cipher.getAuthTag(), ciphertext]));
}

export function decryptSecret(stored: Uint8Array): string {
  // A row shorter than its own header cannot be unpacked, and slicing it would hand
  // `createDecipheriv` an undersized iv — a throw with a far less useful message.
  if (stored.length < IV_BYTES + TAG_BYTES) throw new SecretUnreadableError();

  const buffer = Buffer.from(stored);
  const iv = buffer.subarray(0, IV_BYTES);
  const tag = buffer.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = buffer.subarray(IV_BYTES + TAG_BYTES);

  try {
    const decipher = createDecipheriv(ALGORITHM, key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    // Every failure in here is the same actionable fact — the stored bytes do not decrypt
    // under the current key — and the underlying message ("unsupported state or unable to
    // authenticate data") tells the person who has to fix it nothing at all.
    throw new SecretUnreadableError();
  }
}
