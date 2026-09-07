import { slugify } from '@ui-builder/schema';
import { ConflictError } from './errors.js';

/** Used when a name slugifies to nothing at all — e.g. a workspace named "🎨". */
const FALLBACK_BASE = 'workspace';

/**
 * Finds a free slug near `base`, appending `-2`, `-3`, … until one is unused.
 *
 * This is a convenience for auto-generated slugs, not a lock: two simultaneous creates
 * can still pick the same value. The unique constraint is what actually guarantees
 * correctness, and the caller retries on the resulting conflict.
 */
export async function resolveUniqueSlug(
  desired: string,
  isTaken: (slug: string) => Promise<boolean>,
  { fallback = FALLBACK_BASE, maxAttempts = 50 } = {},
): Promise<string> {
  const base = slugify(desired) || fallback;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    // Leave room for the suffix so a 48-character name cannot produce a 50-character slug.
    const suffix = attempt === 1 ? '' : `-${attempt}`;
    const candidate = `${base.slice(0, 48 - suffix.length).replace(/-+$/, '')}${suffix}`;

    if (!(await isTaken(candidate))) {
      return candidate;
    }
  }

  throw new ConflictError(`Could not find an available name based on "${base}".`);
}
