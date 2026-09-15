import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Resolve .env relative to this package, not the cwd, so the API behaves the same
// whether it is started from the repo root or from apps/api.
loadEnv({ path: path.join(packageRoot, '.env') });

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1),
  WEB_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),

  /*
   * The key that encrypts stored API-integration tokens (src/lib/secrets.ts).
   *
   * Optional, and derived from JWT_SECRET when absent, so a fresh checkout boots without
   * it. Set it to 32 bytes as base64 or hex for real key separation. Changing it makes
   * already-stored tokens undecryptable — they have to be re-entered, which the studio
   * asks for rather than failing silently.
   */
  INTEGRATION_KEY: z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (value === undefined || value === '') return undefined;

      const decoded = /^[0-9a-fA-F]{64}$/.test(value)
        ? Buffer.from(value, 'hex')
        : Buffer.from(value, 'base64');

      if (decoded.length !== 32) {
        ctx.addIssue({ code: 'custom', message: 'must be 32 bytes, as base64 or hex' });
        return z.NEVER;
      }

      return decoded;
    }),

  /*
   * Whether an integration test run may reach addresses inside this machine's own
   * network. See src/lib/outbound.ts for why the default differs by environment: local
   * development routinely points at localhost, and production must not be able to reach
   * the metadata service.
   *
   * Left as the raw choice here and defaulted after the parse, against the *validated*
   * NODE_ENV rather than against `process.env.NODE_ENV` read a second time. Zod cannot see
   * a sibling field from inside a transform, and a field whose security depends on
   * re-reading the environment behind the schema's back is one whose two readings can
   * disagree. See `allowsPrivateNetwork` below.
   */
  INTEGRATION_ALLOW_PRIVATE_NETWORK: z.enum(['true', 'false']).optional(),

  /*
   * Object storage for uploaded assets — S3, or anything speaking its API (R2, MinIO).
   *
   * Every field is optional, and that is deliberate: this repo's premise is that it runs
   * with no third-party keys (D9), so a checkout with no bucket has to boot. What it does
   * not get is uploads — `createStorage` returns null, the asset routes answer 503 saying
   * why, and the studio does not offer the button. Half-configuring it is the case worth
   * catching, so the schema demands all four together rather than one at a time.
   */
  S3_BUCKET: z.string().min(1).optional(),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  /** Set for anything that is not AWS itself. */
  S3_ENDPOINT: z.url().optional(),
  /** MinIO and most self-hosted gateways address buckets by path rather than by subdomain. */
  S3_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  /**
   * Where the world reads these objects — a CDN, or the bucket's own public address.
   *
   * Derived from the endpoint and bucket when omitted. It is separate from `S3_ENDPOINT`
   * because the address the API writes to and the address a browser reads from are
   * routinely different, and an asset URL is stored in a document that outlives both.
   */
  S3_PUBLIC_URL: z.url().optional(),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map(
    (issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`,
  );
  console.error(
    [
      'Invalid API environment.',
      'Check apps/api/.env against apps/api/.env.example:',
      ...issues,
      '',
    ].join('\n'),
  );
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

/**
 * Whether a test run may reach this machine's own network.
 *
 * Explicit setting if there is one; otherwise off in production and on everywhere else.
 * Resolved here rather than in the schema so it reads the NODE_ENV that was actually
 * validated — see the field's own note.
 */
export const allowsPrivateNetwork =
  env.INTEGRATION_ALLOW_PRIVATE_NETWORK === undefined
    ? !isProduction
    : env.INTEGRATION_ALLOW_PRIVATE_NETWORK === 'true';

/**
 * Whether the process looks deployed while not saying it is.
 *
 * Three things weaken at once when NODE_ENV is anything but `production`: the refresh
 * cookie loses `Secure` (modules/auth/tokens.ts), the SSRF guard starts allowing the
 * private network (lib/outbound.ts), and pino-pretty becomes the logger. Each of those is
 * correct for development and none of them is correct on a public address, so a deployment
 * that forgets the variable is silently three settings weaker than it reads as.
 *
 * Binding off-loopback is the signal, because that is the thing a laptop does not do: the
 * default HOST is 127.0.0.1 and compose sets 0.0.0.0 precisely so Caddy can reach it.
 * There is nothing to *enforce* here — refusing to boot would be a new way to take an
 * already-running deployment down — so this is a warning, printed where the operator is.
 */
export function environmentWarnings(): string[] {
  const warnings: string[] = [];
  const loopback = ['127.0.0.1', '::1', 'localhost'];

  if (!isProduction && !isTest && !loopback.includes(env.HOST)) {
    warnings.push(
      `NODE_ENV is "${env.NODE_ENV}" but the API is binding to ${env.HOST}, which is not ` +
        'loopback. If this is a real deployment, set NODE_ENV=production: without it the ' +
        'refresh cookie is not marked Secure and integration requests may reach private ' +
        'addresses.',
    );
  }

  if (allowsPrivateNetwork) {
    warnings.push(
      'Integration test runs may reach private addresses ' +
        '(INTEGRATION_ALLOW_PRIVATE_NETWORK). Correct for local development; in production ' +
        'this is the path a server-side request forgery takes to the metadata service.',
    );
  }

  return warnings;
}
