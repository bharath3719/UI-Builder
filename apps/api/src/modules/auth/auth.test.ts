import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ApiErrorResponse, AuthResponse, AuthUser } from '@ui-builder/schema';
import { createTestApi, refreshCookieFrom, type TestApi } from '../../test/api.js';
import { REFRESH_COOKIE_NAME, REFRESH_COOKIE_PATH } from './tokens.js';

let api: TestApi;

beforeAll(async () => {
  api = await createTestApi();
});

afterAll(async () => {
  await api.close();
});

beforeEach(async () => {
  await api.reset();
});

describe('POST /api/auth/register', () => {
  it('creates an account and returns a signed-in session', async () => {
    const response = await api.post('/api/auth/register', {
      body: { email: 'ada@example.test', password: 'correct horse battery', name: 'Ada' },
    });

    expect(response.statusCode).toBe(201);

    const body = response.json<AuthResponse>();
    expect(body.user).toMatchObject({ email: 'ada@example.test', name: 'Ada' });
    expect(body.accessToken).toBeTypeOf('string');
    expect(body.expiresIn).toBeGreaterThan(0);
  });

  it('puts the refresh token in an httpOnly cookie and never in the body', async () => {
    const response = await api.post('/api/auth/register', {
      body: { email: 'ada@example.test', password: 'correct horse battery', name: 'Ada' },
    });

    const cookie = response.cookies.find((entry) => entry.name === REFRESH_COOKIE_NAME);

    expect(cookie).toBeDefined();
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite?.toLowerCase()).toBe('lax');
    // Scoped to the auth routes so it is never attached to ordinary API calls.
    expect(cookie?.path).toBe(REFRESH_COOKIE_PATH);
    expect(response.body).not.toContain(cookie?.value);
  });

  it('never returns the password hash', async () => {
    const response = await api.post('/api/auth/register', {
      body: { email: 'ada@example.test', password: 'correct horse battery', name: 'Ada' },
    });

    expect(response.body).not.toContain('argon2');
    expect(response.body).not.toContain('passwordHash');
    expect(response.body).not.toContain('correct horse battery');
  });

  it('normalises the email, so case and padding do not create a second account', async () => {
    const first = await api.post('/api/auth/register', {
      body: { email: '  Ada@Example.TEST ', password: 'correct horse battery', name: 'Ada' },
    });

    expect(first.json<AuthResponse>().user.email).toBe('ada@example.test');

    const second = await api.post('/api/auth/register', {
      body: { email: 'ADA@example.test', password: 'another password', name: 'Impostor' },
    });

    expect(second.statusCode).toBe(409);
    expect(second.json<ApiErrorResponse>().error.code).toBe('conflict');
  });

  it('rejects a bad body with per-field detail', async () => {
    const response = await api.post('/api/auth/register', {
      body: { email: 'not-an-email', password: 'short', name: '' },
    });

    expect(response.statusCode).toBe(400);

    const { error } = response.json<ApiErrorResponse>();
    expect(error.code).toBe('validation_error');
    expect(error.details?.map((detail) => detail.path).sort()).toEqual([
      'body.email',
      'body.name',
      'body.password',
    ]);
  });
});

describe('POST /api/auth/login', () => {
  it('signs an existing user in', async () => {
    const user = await api.register();

    const response = await api.post('/api/auth/login', {
      body: { email: user.email, password: user.password },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<AuthResponse>().user.id).toBe(user.id);
    expect(refreshCookieFrom(response)).toBeTypeOf('string');
  });

  it('gives the same answer for a wrong password and an unknown account', async () => {
    const user = await api.register();

    const wrongPassword = await api.post('/api/auth/login', {
      body: { email: user.email, password: 'not the password' },
    });
    const unknownAccount = await api.post('/api/auth/login', {
      body: { email: 'nobody@example.test', password: 'not the password' },
    });

    // Identical status and wording: the response must not reveal which addresses
    // have accounts. password.ts covers the timing half of the same concern.
    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownAccount.statusCode).toBe(401);
    expect(unknownAccount.json<ApiErrorResponse>().error).toEqual(
      wrongPassword.json<ApiErrorResponse>().error,
    );
  });
});

describe('GET /api/auth/me', () => {
  it('returns the signed-in user', async () => {
    const user = await api.register({ name: 'Grace' });

    const response = await api.get('/api/auth/me', { as: user });

    expect(response.statusCode).toBe(200);
    expect(response.json<AuthUser>()).toMatchObject({ id: user.id, name: 'Grace' });
  });

  it('rejects a missing, malformed or forged token', async () => {
    const noToken = await api.get('/api/auth/me');
    const malformed = await api.get('/api/auth/me', { headers: { authorization: 'Bearer nope' } });
    const forged = await api.get('/api/auth/me', {
      headers: {
        // Correctly shaped, signed with the wrong key.
        authorization:
          'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhYmMiLCJlbWFpbCI6ImFAYi5jbyJ9.' +
          'ZmFrZS1zaWduYXR1cmUtdGhhdC13aWxsLW5vdC12ZXJpZnk',
      },
    });

    for (const response of [noToken, malformed, forged]) {
      expect(response.statusCode).toBe(401);
      expect(response.json<ApiErrorResponse>().error.code).toBe('unauthorized');
    }
  });
});

describe('POST /api/auth/refresh', () => {
  it('rotates the token and keeps the session alive', async () => {
    const user = await api.register();

    const response = await api.post('/api/auth/refresh', { refreshToken: user.refreshToken });

    expect(response.statusCode).toBe(200);
    expect(response.json<AuthResponse>().user.id).toBe(user.id);

    const rotated = refreshCookieFrom(response);
    expect(rotated).toBeTypeOf('string');
    expect(rotated).not.toBe(user.refreshToken);

    // The new token works in turn.
    const again = await api.post('/api/auth/refresh', { refreshToken: rotated });
    expect(again.statusCode).toBe(200);
  });

  it('refuses a request with no cookie at all', async () => {
    const response = await api.post('/api/auth/refresh');

    expect(response.statusCode).toBe(401);
  });

  it('treats a replayed token as theft and drops every session for that user', async () => {
    const user = await api.register();

    const first = await api.post('/api/auth/refresh', { refreshToken: user.refreshToken });
    const rotated = refreshCookieFrom(first);

    // The original token has already been spent. Presenting it again means a copy
    // exists somewhere, so the live token is revoked too rather than just this one.
    const replay = await api.post('/api/auth/refresh', { refreshToken: user.refreshToken });
    expect(replay.statusCode).toBe(401);

    const afterReplay = await api.post('/api/auth/refresh', { refreshToken: rotated });
    expect(afterReplay.statusCode).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('revokes the session and clears the cookie', async () => {
    const user = await api.register();

    const response = await api.post('/api/auth/logout', { refreshToken: user.refreshToken });

    expect(response.statusCode).toBe(204);
    expect(refreshCookieFrom(response)).toBe('');

    const afterLogout = await api.post('/api/auth/refresh', { refreshToken: user.refreshToken });
    expect(afterLogout.statusCode).toBe(401);
  });

  it('succeeds when there is nothing to sign out of', async () => {
    // Signing out is most often reached with an already-dead session; erroring there
    // would leave the studio unable to clear its own state.
    const response = await api.post('/api/auth/logout');

    expect(response.statusCode).toBe(204);
  });
});
