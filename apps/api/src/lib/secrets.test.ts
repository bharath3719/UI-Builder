import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, SecretUnreadableError } from './secrets.js';

describe('encryptSecret / decryptSecret', () => {
  it('round-trips a token', () => {
    const token = 'sk-live-0123456789';

    expect(decryptSecret(encryptSecret(token))).toBe(token);
  });

  it('round-trips non-ASCII and empty-adjacent values', () => {
    for (const token of ['ü', '🔑 key', ' ', 'a'.repeat(4000)]) {
      expect(decryptSecret(encryptSecret(token))).toBe(token);
    }
  });

  /** A fresh IV per call, so the same token does not produce a recognisable row. */
  it('produces different ciphertext each time', () => {
    const first = encryptSecret('same');
    const second = encryptSecret('same');

    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(false);
  });

  it('stores nothing resembling the plaintext', () => {
    const stored = Buffer.from(encryptSecret('sk-live-0123456789'));

    expect(stored.toString('utf8')).not.toContain('sk-live');
  });

  /** `noUncheckedIndexedAccess` makes a bare `bytes[i] ^= …` a type error. */
  function flipByte(bytes: Uint8Array, index: number): Uint8Array {
    bytes.set([(bytes.at(index) ?? 0) ^ 0xff], index < 0 ? bytes.length + index : index);
    return bytes;
  }

  /**
   * The reason for GCM rather than a bare cipher: a tampered row must fail loudly instead
   * of decrypting to something that then goes out in an Authorization header.
   */
  it('refuses a row whose ciphertext was altered', () => {
    const stored = flipByte(encryptSecret('sk-live-0123456789'), -1);

    expect(() => decryptSecret(stored)).toThrow(SecretUnreadableError);
  });

  it('refuses a row whose auth tag was altered', () => {
    // The tag sits at bytes 12..27, immediately after the IV.
    const stored = flipByte(encryptSecret('sk-live-0123456789'), 12);

    expect(() => decryptSecret(stored)).toThrow(SecretUnreadableError);
  });

  it('refuses a row whose IV was altered', () => {
    const stored = flipByte(encryptSecret('sk-live-0123456789'), 0);

    expect(() => decryptSecret(stored)).toThrow(SecretUnreadableError);
  });

  it('refuses a row too short to contain its own header', () => {
    expect(() => decryptSecret(new Uint8Array(8))).toThrow(SecretUnreadableError);
  });

  it('reports something a person can act on', () => {
    expect(() => decryptSecret(new Uint8Array(40))).toThrow(/Enter it again/);
  });
});
