import { describe, expect, it } from 'vitest';
import type { Role } from './common.js';
import { REQUIRES, hasAtLeast, outranks } from './roles.js';

const ALL_ROLES: Role[] = ['OWNER', 'ADMIN', 'EDITOR', 'VIEWER'];

describe('hasAtLeast', () => {
  it('is satisfied by the exact role', () => {
    for (const role of ALL_ROLES) {
      expect(hasAtLeast(role, role)).toBe(true);
    }
  });

  it('ranks owner above admin above editor above viewer', () => {
    expect(hasAtLeast('OWNER', 'ADMIN')).toBe(true);
    expect(hasAtLeast('ADMIN', 'EDITOR')).toBe(true);
    expect(hasAtLeast('EDITOR', 'VIEWER')).toBe(true);

    expect(hasAtLeast('ADMIN', 'OWNER')).toBe(false);
    expect(hasAtLeast('EDITOR', 'ADMIN')).toBe(false);
    expect(hasAtLeast('VIEWER', 'EDITOR')).toBe(false);
  });

  it('lets every role read, and only the owner delete a workspace', () => {
    for (const role of ALL_ROLES) {
      expect(hasAtLeast(role, REQUIRES.workspaceRead)).toBe(true);
      expect(hasAtLeast(role, REQUIRES.workspaceDelete)).toBe(role === 'OWNER');
    }
  });

  it('puts project deletion above project editing', () => {
    expect(hasAtLeast('EDITOR', REQUIRES.projectWrite)).toBe(true);
    expect(hasAtLeast('EDITOR', REQUIRES.projectDelete)).toBe(false);
    expect(hasAtLeast('ADMIN', REQUIRES.projectDelete)).toBe(true);
  });
});

describe('outranks', () => {
  it('is strict, so an equal role cannot act on its peer', () => {
    for (const role of ALL_ROLES) {
      expect(outranks(role, role)).toBe(false);
    }
  });

  it('is what stops an admin from touching an owner', () => {
    expect(outranks('OWNER', 'ADMIN')).toBe(true);
    expect(outranks('ADMIN', 'OWNER')).toBe(false);
  });
});
