import { z } from 'zod';
import { DisplayName, Id } from './common.js';

/**
 * Normalised before validation, so `"  BOB@Example.com "` and `"bob@example.com"` are
 * the same account. Order matters: `z.email().trim()` would validate the padded string
 * and reject it.
 */
export const Email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('must be a valid email address'))
  .pipe(z.string().max(254, 'is too long'));

/**
 * Deliberately not trimmed — leading and trailing spaces are legitimate password
 * characters. The upper bound exists because hashing is intentionally expensive and
 * an unbounded input is a free way to tie up the event loop.
 */
export const Password = z
  .string()
  .min(8, 'must be at least 8 characters')
  .max(200, 'must be at most 200 characters');

export const RegisterRequest = z.object({
  email: Email,
  password: Password,
  name: DisplayName,
});
export type RegisterRequest = z.infer<typeof RegisterRequest>;

export const LoginRequest = z.object({
  email: Email,
  /** Only length-bounded: an old password that predates a rule change must still log in. */
  password: z.string().min(1, 'is required').max(200),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

/** The authenticated user as the studio sees them. Never includes the password hash. */
export const AuthUser = z.object({
  id: Id,
  email: z.string(),
  name: z.string(),
  createdAt: z.iso.datetime(),
});
export type AuthUser = z.infer<typeof AuthUser>;

/**
 * Returned by register, login and refresh. The refresh token is *not* in this body —
 * it is set as an httpOnly cookie so studio JavaScript can never read it (D9).
 */
export const AuthResponse = z.object({
  user: AuthUser,
  accessToken: z.string(),
  /** Access-token lifetime in seconds, so the client can refresh before it expires. */
  expiresIn: z.number().int().positive(),
});
export type AuthResponse = z.infer<typeof AuthResponse>;

/** Body of the JWT access token. `sub` is the user id. */
export const AccessTokenClaims = z.object({
  sub: Id,
  email: z.string(),
});
export type AccessTokenClaims = z.infer<typeof AccessTokenClaims>;
