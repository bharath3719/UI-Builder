import { hash, verify } from '@node-rs/argon2';

/**
 * OWASP's recommended argon2id parameters (19 MiB, 2 passes, 1 lane) — about 50ms per
 * hash on this machine.
 *
 * `algorithm` is deliberately not passed: it is an ambient `const enum` in the library's
 * types, which `isolatedModules` forbids importing. argon2id is the default, and
 * password.test.ts asserts the encoded prefix so a change in that default fails the
 * build rather than silently weakening every new password.
 */
const HASH_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * A valid argon2id hash of a value nobody knows, used to spend the same ~50ms on a
 * login for an address that has no account as one that does. Without it, response time
 * alone tells an attacker which email addresses are registered.
 */
let decoyHash: string | undefined;

async function getDecoyHash(): Promise<string> {
  decoyHash ??= await hash(
    // Never compared against anything a caller supplies; the value only has to exist.
    `decoy:${Math.random()}:${Date.now()}`,
    HASH_OPTIONS,
  );
  return decoyHash;
}

export function hashPassword(password: string): Promise<string> {
  return hash(password, HASH_OPTIONS);
}

/**
 * Constant-ish time by construction: argon2 verification cost depends on the stored
 * parameters, not on how much of the password matched.
 *
 * A malformed or truncated hash makes the library throw. That is a corrupted row rather
 * than a wrong password, but either way the answer to "may this person in?" is no.
 */
export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  try {
    return await verify(storedHash, password);
  } catch {
    return false;
  }
}

/**
 * Burns a comparable amount of time when there is no user to check against. Callers
 * must await this on the "no such account" path — see the note on {@link decoyHash}.
 */
export async function burnPasswordTime(): Promise<void> {
  await verifyPassword(await getDecoyHash(), 'not the decoy');
}
