import { z } from 'zod';

/**
 * Workspace roles, most- to least-privileged. Mirrors the Prisma `Role` enum; the two
 * are the same string union so values cross the boundary without mapping.
 */
export const Role = z.enum(['OWNER', 'ADMIN', 'EDITOR', 'VIEWER']);
export type Role = z.infer<typeof Role>;

/**
 * URL-safe identifier: lowercase alphanumerics in hyphen-separated groups. No leading,
 * trailing or doubled hyphens, so a slug always round-trips through a path segment.
 */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Slugs that would collide with studio routes (`/w/new`, `/w/:ws/settings`). Rejected
 * at validation so a workspace can never make a route unreachable.
 */
export const RESERVED_SLUGS = new Set([
  'new',
  'api',
  'admin',
  'settings',
  'login',
  'logout',
  'signup',
  'register',
  'preview',
  'health',
  'static',
  'assets',
]);

export const Slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, 'must be at least 2 characters')
  .max(48, 'must be at most 48 characters')
  .regex(SLUG_PATTERN, 'may contain only lowercase letters, numbers and single hyphens')
  .refine((value) => !RESERVED_SLUGS.has(value), 'is reserved');

/** Human-facing name for a workspace or project. */
export const DisplayName = z.string().trim().min(1, 'is required').max(80, 'is too long');

/** An opaque database id. Not pattern-checked: the id format is the server's business. */
export const Id = z.string().min(1);

/**
 * Latin letters NFKD leaves whole, because they are distinct letters rather than accented
 * forms of a base one. Without an explicit spelling they fall through to the `[^a-z0-9]`
 * pass and vanish — "Straße" would slug as "stra-e".
 */
const LETTER_FOLDS: Record<string, string> = {
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  ø: 'o',
  đ: 'd',
  ð: 'd',
  þ: 'th',
  ł: 'l',
  ı: 'i',
  ħ: 'h',
  ŧ: 't',
};

const FOLDABLE_LETTER = new RegExp(`[${Object.keys(LETTER_FOLDS).join('')}]`, 'gu');

/**
 * Turns arbitrary text into something matching {@link SLUG_PATTERN}, or `''` when the
 * input has nothing usable in it (e.g. all emoji). Callers decide what to do with `''`.
 */
export function slugify(input: string): string {
  return (
    input
      // Lowercase first so the fold table needs only one case per letter — and so "ẞ"
      // reaches it as "ß".
      .toLowerCase()
      .replace(FOLDABLE_LETTER, (letter) => LETTER_FOLDS[letter] ?? letter)
      // NFKD splits "é" into "e" + a combining mark, which \p{M} then drops — so
      // "Café" slugs as "cafe" rather than losing the letter altogether.
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48)
      // A trailing hyphen can reappear after the length cap.
      .replace(/-+$/g, '')
  );
}
