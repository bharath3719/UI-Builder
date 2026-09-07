import { createHash, randomBytes } from 'node:crypto';
import type { CookieSerializeOptions } from '@fastify/cookie';
import { isProduction } from '../../env.js';

/** Access tokens are short-lived because nothing can revoke one before it expires. */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

/** How long a session survives without the user signing in again. */
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

export const REFRESH_COOKIE_NAME = 'ui_builder_refresh';

/**
 * Scoped to the auth routes: the browser then never attaches a long-lived credential to
 * ordinary API calls, which keeps it out of logs and out of reach of any other handler.
 */
export const REFRESH_COOKIE_PATH = '/api/auth';

export function refreshCookieOptions(): CookieSerializeOptions {
  return {
    httpOnly: true,
    // Studio JavaScript must never be able to read this (D9).
    secure: isProduction,
    // 'lax' still sends the cookie on top-level navigation back to the app, but not on
    // cross-site form posts. The API is same-site with the studio in every deployment.
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_TOKEN_TTL_SECONDS,
  };
}

/** Clears the cookie by matching every attribute that scoped it. */
export function clearedRefreshCookieOptions(): CookieSerializeOptions {
  return { ...refreshCookieOptions(), maxAge: 0, expires: new Date(0) };
}

/**
 * 256 bits from the CSPRNG. This is a bearer credential, not a hash input under an
 * attacker's control, so there is nothing to stretch — the entropy is the security.
 */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Refresh tokens are stored hashed, so a leaked database dump does not hand over live
 * sessions. SHA-256 rather than argon2 is correct here: the input is already 256 bits
 * of randomness, so there is no guessable password to slow an attacker down over, and
 * lookup happens on every refresh.
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function refreshTokenExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000);
}
