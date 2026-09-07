import { describe, expect, it } from 'vitest';
import { SLUG_PATTERN } from '@ui-builder/schema';
import { resolveUniqueSlug } from './slug.js';

/** `isTaken` backed by a set, standing in for the uniqueness query. */
function taken(...slugs: string[]) {
  const set = new Set(slugs);
  return (slug: string) => Promise.resolve(set.has(slug));
}

describe('resolveUniqueSlug', () => {
  it('uses the obvious slug when it is free', async () => {
    await expect(resolveUniqueSlug('Acme Inc', taken())).resolves.toBe('acme-inc');
  });

  it('counts upwards past whatever is taken', async () => {
    await expect(resolveUniqueSlug('Acme', taken('acme'))).resolves.toBe('acme-2');
    await expect(resolveUniqueSlug('Acme', taken('acme', 'acme-2'))).resolves.toBe('acme-3');
  });

  it('falls back when the name slugifies to nothing', async () => {
    await expect(resolveUniqueSlug('🎨', taken())).resolves.toBe('workspace');
    await expect(resolveUniqueSlug('...', taken(), { fallback: 'project' })).resolves.toBe(
      'project',
    );
  });

  it('stays within the length limit even once a suffix is added', async () => {
    const long = 'a'.repeat(60);
    const existing = Array.from({ length: 12 }, (_, index) =>
      index === 0 ? 'a'.repeat(48) : `${'a'.repeat(46)}-${index + 1}`,
    );

    const slug = await resolveUniqueSlug(long, taken(...existing));

    expect(slug.length).toBeLessThanOrEqual(48);
    expect(slug).toMatch(SLUG_PATTERN);
  });

  it('never returns something the slug pattern would reject', async () => {
    for (const name of ['Acme Inc', 'Café Über', '  spaced  out  ', 'a-b--c', 'Ünïcodé!!!', '99']) {
      const slug = await resolveUniqueSlug(name, taken());
      expect(slug, `slug for ${JSON.stringify(name)}`).toMatch(SLUG_PATTERN);
    }
  });

  it('gives up rather than looping forever', async () => {
    const everything = (slug: string) => Promise.resolve(slug.startsWith('acme'));

    await expect(resolveUniqueSlug('Acme', everything, { maxAttempts: 3 })).rejects.toThrow(
      /available name/i,
    );
  });
});
