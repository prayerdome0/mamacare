// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Firestore rules sanity checks.
 *
 * There is no emulator in CI for this project, so these tests read the rules file
 * itself and hold down the things that silently break a deployment:
 *
 *  1. The rules language has **no loop construct**. An earlier revision used
 *     `for (let key in keys)`, which the compiler rejects — the file could not be
 *     deployed at all, so the project kept whatever rules it had before and every
 *     profile write from registration was refused. `Map.diff().affectedKeys()`
 *     replaces the loop.
 *  2. Sweeping privileges must stay denied by default, and clinical rows must not
 *     be deletable.
 *  3. The first `users/{uid}` write a client may make must not be able to set a
 *     privileged role or the server-managed `privilegeVersion`.
 */

const rulesPath = fileURLToPath(new URL('../../../firestore.rules', import.meta.url));
const rules = readFileSync(rulesPath, 'utf8');

/** Strip comments so a rule cannot be "satisfied" by a comment mentioning it. */
const code = rules
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((line) => line.replace(/\/\/.*$/, ''))
  .join('\n');

describe('the rules file compiles', () => {
  it('contains no construct the rules language does not support', () => {
    expect(code).not.toMatch(/\bfor\s*\(/);
    expect(code).not.toMatch(/\bwhile\s*\(/);
    expect(code).not.toMatch(/=>/);
    expect(code).not.toMatch(/\?\./);
    expect(code).not.toMatch(/\bforEach\b|\bmap\s*\(/);
  });

  it('balances every brace, parenthesis and bracket', () => {
    const counts = (open: string, close: string) => {
      let depth = 0;
      for (const character of code) {
        if (character === open) depth += 1;
        if (character === close) depth -= 1;
        expect(depth).toBeGreaterThanOrEqual(0);
      }
      return depth;
    };
    expect(counts('{', '}')).toBe(0);
    expect(counts('(', ')')).toBe(0);
    expect(counts('[', ']')).toBe(0);
  });

  it('defines every function it calls', () => {
    const defined = new Set([...code.matchAll(/function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)].map((m) => m[1] ?? ''));
    const builtins = new Set(['hasAny', 'hasAll', 'hasOnly', 'keys', 'diff', 'affectedKeys', 'get', 'size', 'containsAny', 'containsAll', 'contains', 'matches', 'isEmpty']);
    const called = [...code.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)].map((m) => m[1] ?? '');
    const missing = [...new Set(called.filter((name) => !defined.has(name) && !builtins.has(name)))]
      // language keywords and helpers from the SDK surface
      .filter((name) => !['if', 'return', 'let', 'in', 'is', 'match', 'function', 'allow', 'service', 'request', 'resource', 'rules_version'].includes(name));
    expect(missing).toEqual([]);
  });

  it('closes with a deny-everything catch-all', () => {
    expect(code).toMatch(/match\s+\/\{document=\*\*\}/);
    expect(code).toMatch(/allow\s+read,\s*write:\s*if\s+false/);
  });
});

describe('privilege escalation is impossible from a client', () => {
  const usersBlock = code.slice(code.indexOf('match /users/'), code.indexOf('/* ── clinical records'));

  it('accepts only non-privileged roles on the first write', () => {
    expect(usersBlock).toMatch(/privilegeVersion/);
    expect(usersBlock).toMatch(/request\.resource\.data\.role in \['MIDWIFE', 'NURSE', 'COMMUNITY_HEALTH_WORKER', 'FACILITY_SUPERVISOR', 'MOTHER'\]/);
    expect(usersBlock).not.toMatch(/'ADMIN'\s*\]/);
  });

  it('refuses a client-supplied privilegeVersion beyond the initial value', () => {
    expect(usersBlock).toMatch(/!request\.resource\.data\.keys\(\)\.hasAny\(\['privilegeVersion'\]\)/);
    expect(usersBlock).toMatch(/request\.resource\.data\.privilegeVersion == 1/);
  });

  it('blocks self-service changes to role, status and facility', () => {
    expect(usersBlock).toMatch(/patchTouchesPrivilege\(resource\.data, request\.resource\.data\)/);
  });

  it('never deletes an account', () => {
    expect(usersBlock).toMatch(/allow delete: if false/);
  });
});

describe('deletion policy', () => {
  it('makes clinical records undeletable from the client', () => {
    const clinical = ['mothers', 'pregnancies', 'anc_visits', 'appointments', 'alerts', 'referrals', 'documents', 'reports', 'notifications', 'audit_logs'];
    for (const collection of clinical) {
      const start = code.indexOf(`match /${collection}/`);
      expect(start, `match /${collection}/ missing`).toBeGreaterThan(-1);
      const block = code.slice(start, start + 1200);
      expect(block, `${collection} must not be deletable`).toMatch(/allow (read: if false|delete: if false|create, update, delete: if false|write: if false)|allow update, delete: if false/);
    }
  });
});
