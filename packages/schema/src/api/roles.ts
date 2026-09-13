import type { Role } from './common.js';

/**
 * The privilege ordering behind every access check. Kept as an explicit map rather than
 * relying on the declaration order of the Prisma enum, so reordering that enum for
 * cosmetic reasons cannot silently change who can delete a workspace.
 */
const ROLE_RANK: Record<Role, number> = {
  OWNER: 3,
  ADMIN: 2,
  EDITOR: 1,
  VIEWER: 0,
};

/** True when `role` is at least as privileged as `minimum`. */
export function hasAtLeast(role: Role, minimum: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

/** True when `actor` outranks `target` — the test for "may I act on this member?". */
export function outranks(actor: Role, target: Role): boolean {
  return ROLE_RANK[actor] > ROLE_RANK[target];
}

/**
 * What each operation needs. Having them named in one place means a route cannot
 * quietly disagree with its sibling about who is allowed in.
 *
 * This lives in the shared contract rather than in the API because the studio needs the
 * same answers: an action a viewer cannot take should not be offered to them in the
 * first place. The server still enforces it — this only decides what to render.
 */
export const REQUIRES = {
  /** Reading a workspace, its members, or its projects. */
  workspaceRead: 'VIEWER',
  /** Renaming a workspace or managing its members. */
  workspaceManage: 'ADMIN',
  /** Deleting a workspace outright. */
  workspaceDelete: 'OWNER',
  /** Creating, renaming and archiving projects. */
  projectWrite: 'EDITOR',
  /** Deleting a project and its history for good. */
  projectDelete: 'ADMIN',
  /** Listing a workspace's API integrations and their endpoints — never their secrets. */
  integrationRead: 'VIEWER',
  /** Creating, editing and deleting connections and endpoints, and setting a token. */
  integrationWrite: 'EDITOR',
  /**
   * Reading a stored token back.
   *
   * Editor rather than viewer, and the consequence is worth stating: a viewer can open a
   * project whose queries need this token and will see those queries fail, because the
   * browser makes the call itself and cannot be handed a credential its role may not read.
   * That is the price of the direct-from-browser call path — a server-side proxy would
   * make the question moot by never handing the token to anyone. Loosen it here, in one
   * line, if a workspace would rather its viewers saw live data than kept the token from
   * them.
   */
  integrationSecretRead: 'EDITOR',
} as const satisfies Record<string, Role>;
