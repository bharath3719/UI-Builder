import { describe, expect, it } from 'vitest';
import { burnPasswordTime, hashPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('uses argon2id with the OWASP parameters', async () => {
    const hash = await hashPassword('correct horse battery staple');

    // password.ts cannot name the algorithm at compile time (ambient const enum), so
    // this assertion is what pins it. If a library upgrade changes the default, this
    // fails rather than quietly hashing every new password more weakly.
    expect(hash.startsWith('$argon2id$v=19$m=19456,t=2,p=1$')).toBe(true);
  });

  it('salts, so the same password hashes differently every time', async () => {
    const [first, second] = await Promise.all([hashPassword('same'), hashPassword('same')]);

    expect(first).not.toBe(second);
    await expect(verifyPassword(first, 'same')).resolves.toBe(true);
    await expect(verifyPassword(second, 'same')).resolves.toBe(true);
  });

  it('accepts the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('s3cret-passphrase');

    await expect(verifyPassword(hash, 's3cret-passphrase')).resolves.toBe(true);
    await expect(verifyPassword(hash, 's3cret-passphras')).resolves.toBe(false);
    await expect(verifyPassword(hash, '')).resolves.toBe(false);
  });

  it('treats a corrupted hash as a failed verification rather than throwing', async () => {
    await expect(verifyPassword('not-a-hash', 'anything')).resolves.toBe(false);
    await expect(verifyPassword('', 'anything')).resolves.toBe(false);
  });

  it('burns time without a stored hash to check against', async () => {
    await expect(burnPasswordTime()).resolves.toBeUndefined();
  });
});
