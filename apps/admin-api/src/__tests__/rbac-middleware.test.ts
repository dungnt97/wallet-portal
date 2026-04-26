// Unit tests for RBAC middleware — requirePerm and requireAuth
import { describe, expect, it } from 'vitest';
import { PERMS } from '../auth/permissions.js';
import type { Permission, Role } from '../auth/permissions.js';

// ── Permissions matrix (pure data, no Fastify dependency) ────────────────────

describe('PERMS matrix', () => {
  it('admin has all permissions', () => {
    const allPerms = Object.keys(PERMS) as Permission[];
    for (const perm of allPerms) {
      expect(PERMS[perm]).toContain('admin' satisfies Role);
    }
  });

  it('viewer has only read permissions', () => {
    const viewerPerms = (Object.keys(PERMS) as Permission[]).filter((p) =>
      PERMS[p].includes('viewer')
    );
    for (const perm of viewerPerms) {
      expect(perm).toMatch(/\.read$/);
    }
  });

  it('treasurer can approve and execute withdrawals', () => {
    expect(PERMS['withdrawals.approve']).toContain('treasurer');
    expect(PERMS['withdrawals.execute']).toContain('treasurer');
  });

  it('operator cannot approve withdrawals', () => {
    expect(PERMS['withdrawals.approve']).not.toContain('operator');
  });

  it('only admin can manage staff', () => {
    expect(PERMS['staff.manage']).toEqual(['admin']);
  });

  it('operator can credit deposits', () => {
    expect(PERMS['deposits.credit']).toContain('operator');
  });

  it('viewer cannot credit deposits', () => {
    expect(PERMS['deposits.credit']).not.toContain('viewer');
  });

  it('treasurer cannot manage users', () => {
    expect(PERMS['users.manage']).not.toContain('treasurer');
  });
});

// ── requirePerm async handler behaviour ──────────────────────────────────────
// Async preHandlers signal "allow" by returning undefined (no reply sent).
// They signal "deny" by calling reply.code(N).send(...).

describe('requirePerm logic', () => {
  const makeCtx = () => {
    const state = { statusCode: null as number | null, body: null as unknown };
    // biome-ignore lint/suspicious/noExplicitAny: test mock requires loose typing
    const reply: any = {
      code(n: number) {
        state.statusCode = n;
        return reply;
      },
      send(b: unknown) {
        state.body = b;
        return reply;
      },
    };
    return { reply, state };
  };

  it('sends 401 when session has no staff', async () => {
    const { requirePerm } = await import('../auth/rbac.middleware.js');
    const handler = requirePerm('deposits.read');
    // biome-ignore lint/suspicious/noExplicitAny: test mock requires loose typing
    const req: any = { session: {} };
    const { reply, state } = makeCtx();
    await (handler as unknown as (...args: unknown[]) => unknown).call(undefined, req, reply);
    expect(state.statusCode).toBe(401);
    expect((state.body as { code: string }).code).toBe('UNAUTHENTICATED');
  });

  it('sends 403 when role lacks permission', async () => {
    const { requirePerm } = await import('../auth/rbac.middleware.js');
    const handler = requirePerm('staff.manage');
    // biome-ignore lint/suspicious/noExplicitAny: test mock requires loose typing
    const req: any = {
      session: { staff: { id: '1', email: 'v@x.com', name: 'V', role: 'viewer' } },
    };
    const { reply, state } = makeCtx();
    await (handler as unknown as (...args: unknown[]) => unknown).call(undefined, req, reply);
    expect(state.statusCode).toBe(403);
    expect((state.body as { code: string }).code).toBe('FORBIDDEN');
  });

  it('returns undefined (allow) when role has permission', async () => {
    const { requirePerm } = await import('../auth/rbac.middleware.js');
    const handler = requirePerm('deposits.read');
    // biome-ignore lint/suspicious/noExplicitAny: test mock requires loose typing
    const req: any = {
      session: { staff: { id: '1', email: 'a@x.com', name: 'A', role: 'viewer' } },
    };
    const { reply, state } = makeCtx();
    const result = await (handler as unknown as (...args: unknown[]) => unknown).call(
      undefined,
      req,
      reply
    );
    // No reply was sent — handler returned undefined to let Fastify proceed
    expect(result).toBeUndefined();
    expect(state.statusCode).toBeNull();
  });
});
