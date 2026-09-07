import type { FastifyInstance, InjectOptions } from 'fastify';
import type { Response as InjectResponse } from 'light-my-request';
import type { AuthResponse } from '@ui-builder/schema';
import { buildApp } from '../app.js';
import type { Db } from '../db/client.js';
import { REFRESH_COOKIE_NAME } from '../modules/auth/tokens.js';

/** A registered account plus the credentials needed to act as them. */
export interface TestUser {
  id: string;
  email: string;
  name: string;
  password: string;
  accessToken: string;
  /** Raw value of the refresh cookie, for exercising refresh and logout. */
  refreshToken: string;
}

export interface RequestOptions {
  body?: InjectOptions['payload'];
  /** Sends this user's access token. Omit for an unauthenticated request. */
  as?: TestUser;
  /** Overrides the refresh cookie — for testing rotation, reuse and expiry. */
  refreshToken?: string;
  headers?: Record<string, string>;
}

let sequence = 0;

/** Unique per call, so tests never collide on the email unique constraint. */
function nextEmail(): string {
  sequence += 1;
  return `user${sequence}.${process.pid}@example.test`;
}

export interface TestApi {
  app: FastifyInstance;
  db: Db;
  request(
    method: InjectOptions['method'],
    url: string,
    options?: RequestOptions,
  ): Promise<InjectResponse>;
  get(url: string, options?: RequestOptions): Promise<InjectResponse>;
  post(url: string, options?: RequestOptions): Promise<InjectResponse>;
  put(url: string, options?: RequestOptions): Promise<InjectResponse>;
  patch(url: string, options?: RequestOptions): Promise<InjectResponse>;
  delete(url: string, options?: RequestOptions): Promise<InjectResponse>;
  /** Registers a fresh account and returns it already signed in. */
  register(overrides?: Partial<Pick<TestUser, 'email' | 'name' | 'password'>>): Promise<TestUser>;
  reset(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Empties every table between tests. Discovered from the catalogue rather than listed by
 * hand, so a new model added to schema.prisma cannot silently start leaking rows from
 * one test into the next.
 */
async function truncateAll(db: Db): Promise<void> {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;

  if (tables.length === 0) {
    return;
  }

  const list = tables.map((table) => `"public"."${table.tablename}"`).join(', ');

  // CASCADE because the tables reference each other; RESTART IDENTITY so any future
  // sequence starts from a known value.
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

export async function createTestApi(): Promise<TestApi> {
  const app = await buildApp();
  await app.ready();

  const request: TestApi['request'] = (method, url, options = {}) =>
    app.inject({
      method,
      url,
      ...(options.body === undefined ? {} : { payload: options.body }),
      headers: {
        ...(options.as ? { authorization: `Bearer ${options.as.accessToken}` } : {}),
        ...options.headers,
      },
      ...(options.refreshToken === undefined
        ? {}
        : { cookies: { [REFRESH_COOKIE_NAME]: options.refreshToken } }),
    });

  const api: TestApi = {
    app,
    db: app.db,
    request,
    get: (url, options) => request('GET', url, options),
    post: (url, options) => request('POST', url, options),
    put: (url, options) => request('PUT', url, options),
    patch: (url, options) => request('PATCH', url, options),
    delete: (url, options) => request('DELETE', url, options),

    async register(overrides = {}) {
      const credentials = {
        email: overrides.email ?? nextEmail(),
        name: overrides.name ?? 'Test User',
        password: overrides.password ?? 'correct horse battery',
      };

      const response = await request('POST', '/api/auth/register', { body: credentials });

      if (response.statusCode !== 201) {
        throw new Error(`register failed (${response.statusCode}): ${response.body}`);
      }

      const auth = response.json<AuthResponse>();
      const cookie = response.cookies.find((entry) => entry.name === REFRESH_COOKIE_NAME);

      if (!cookie) {
        throw new Error('register did not set a refresh cookie');
      }

      return {
        id: auth.user.id,
        email: auth.user.email,
        name: auth.user.name,
        password: credentials.password,
        accessToken: auth.accessToken,
        refreshToken: cookie.value,
      };
    },

    reset: () => truncateAll(app.db),
    close: () => app.close(),
  };

  return api;
}

/** Pulls the refresh cookie out of a response, or undefined when none was set. */
export function refreshCookieFrom(response: InjectResponse): string | undefined {
  return response.cookies.find((entry) => entry.name === REFRESH_COOKIE_NAME)?.value;
}
