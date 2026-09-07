import type { AuthUser, LoginRequest, RegisterRequest } from '@ui-builder/schema';
import type { Db } from '../../db/client.js';
// Prisma 7's client generator suffixes the plain row types with `Model`.
import type { UserModel } from '../../generated/prisma/models.js';
import { ConflictError, UnauthorizedError } from '../../lib/errors.js';
import { burnPasswordTime, hashPassword, verifyPassword } from './password.js';
import { generateRefreshToken, hashRefreshToken, refreshTokenExpiry } from './tokens.js';

/** A newly established session: who it belongs to, and the token that renews it. */
export interface Session {
  user: AuthUser;
  /** The raw token, returned exactly once. Only its hash is stored. */
  refreshToken: string;
}

/** Strips the password hash. The only way a `User` should ever leave this module. */
export function toAuthUser(user: UserModel): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt.toISOString(),
  };
}

async function issueRefreshToken(db: Db, userId: string): Promise<string> {
  const token = generateRefreshToken();

  await db.refreshToken.create({
    data: { userId, tokenHash: hashRefreshToken(token), expiresAt: refreshTokenExpiry() },
  });

  return token;
}

export async function register(db: Db, input: RegisterRequest): Promise<Session> {
  const existing = await db.user.findUnique({ where: { email: input.email } });
  if (existing) {
    // Deliberate: register cannot hide that an address is taken, because it has to
    // refuse. Login is where enumeration is worth defending against, and it does.
    throw new ConflictError('An account with that email address already exists.');
  }

  const user = await db.user.create({
    data: {
      email: input.email,
      name: input.name,
      passwordHash: await hashPassword(input.password),
    },
  });

  return { user: toAuthUser(user), refreshToken: await issueRefreshToken(db, user.id) };
}

export async function login(db: Db, input: LoginRequest): Promise<Session> {
  const user = await db.user.findUnique({ where: { email: input.email } });

  if (!user) {
    // Spend the same time as a real verification would, then fail identically, so
    // neither the timing nor the message reveals whether the account exists.
    await burnPasswordTime();
    throw new UnauthorizedError('That email or password is incorrect.');
  }

  if (!(await verifyPassword(user.passwordHash, input.password))) {
    throw new UnauthorizedError('That email or password is incorrect.');
  }

  return { user: toAuthUser(user), refreshToken: await issueRefreshToken(db, user.id) };
}

/**
 * Exchanges a refresh token for a new one, invalidating the old.
 *
 * Rotation makes a stolen token useful only until the real user's next refresh — and
 * detectable at that point: a token that has already been spent can only be presented
 * twice if it was copied, so every session for that user is dropped.
 */
export async function refresh(db: Db, rawToken: string): Promise<Session> {
  const stored = await db.refreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(rawToken) },
    include: { user: true },
  });

  if (!stored) {
    throw new UnauthorizedError('Your session is no longer valid.');
  }

  if (stored.revokedAt) {
    await db.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new UnauthorizedError('Your session is no longer valid. Please sign in again.');
  }

  if (stored.expiresAt.getTime() <= Date.now()) {
    await db.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    throw new UnauthorizedError('Your session has expired. Please sign in again.');
  }

  const token = generateRefreshToken();

  // One transaction, so a crash between the two writes cannot leave the user holding a
  // token that was never stored — or two live tokens where there should be one.
  await db.$transaction([
    db.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } }),
    db.refreshToken.create({
      data: {
        userId: stored.userId,
        tokenHash: hashRefreshToken(token),
        expiresAt: refreshTokenExpiry(),
      },
    }),
  ]);

  return { user: toAuthUser(stored.user), refreshToken: token };
}

/** Idempotent: signing out with an already-dead token is a success, not an error. */
export async function logout(db: Db, rawToken: string | undefined): Promise<void> {
  if (!rawToken) {
    return;
  }

  await db.refreshToken.updateMany({
    where: { tokenHash: hashRefreshToken(rawToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getUser(db: Db, userId: string): Promise<AuthUser> {
  const user = await db.user.findUnique({ where: { id: userId } });

  if (!user) {
    // A valid token for a deleted account. Nothing to authorise it against.
    throw new UnauthorizedError('Your account is no longer available.');
  }

  return toAuthUser(user);
}
