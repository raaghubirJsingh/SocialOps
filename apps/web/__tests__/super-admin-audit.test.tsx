/**
 * Super Admin Audit Logs page contracts.
 *
 * Asserts the audit page source, the super-admin-api helper,
 * and the audit log viewer for:
 *   - API endpoint path and query parameters
 *   - Session token header injection
 *   - Action and targetType filter support
 *   - Cursor-based pagination
 *   - Loading, empty, and error states
 *   - Audit event display (timestamp, action, actor, target, details)
 *   - No secrets persisted in localStorage
 *   - No bypass of server-side authorization
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function sourceWithoutComments(relPath: string): string {
  const raw = readFileSync(join(__dirname, '..', relPath), 'utf8');
  return raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('Super Admin Audit Logs contracts', () => {
  it('super-admin-api uses the correct audit-logs endpoint', () => {
    const src = sourceWithoutComments('lib/super-admin-api.ts');
    expect(src).toMatch(/\/admin\/audit-logs\?/);
  });

  it('super-admin-api supports action and targetType filters', () => {
    const src = sourceWithoutComments('lib/super-admin-api.ts');
    expect(src).toMatch(/action/);
    expect(src).toMatch(/targetType/);
    expect(src).toMatch(/searchParams\.set\('action'/);
    expect(src).toMatch(/searchParams\.set\('targetType'/);
  });

  it('super-admin-api supports cursor-based pagination', () => {
    const src = sourceWithoutComments('lib/super-admin-api.ts');
    expect(src).toMatch(/cursor/);
    expect(src).toMatch(/searchParams\.set\('cursor'/);
  });

  it('super-admin-api attaches X-Admin-Session-Token header', () => {
    const src = sourceWithoutComments('lib/super-admin-api.ts');
    expect(src).toMatch(/X-Admin-Session-Token/);
    expect(src).toMatch(/loadSuperAdminSession/);
  });

  it('super-admin-api never persists secrets to localStorage', () => {
    const src = sourceWithoutComments('lib/super-admin-api.ts');
    expect(src).not.toMatch(/localStorage/);
    expect(src).not.toMatch(/sessionStorage/);
    expect(src).not.toMatch(/console\.log/);
  });

  it('audit page integrates fetchAuditLogs', () => {
    const src = sourceWithoutComments('app/(app)/super-admin/audit/page.tsx');
    expect(src).toMatch(/fetchAuditLogs/);
    expect(src).toMatch(/superadmin.*audit-logs/);
  });

  it('audit page supports action filter', () => {
    const src = sourceWithoutComments('app/(app)/super-admin/audit/page.tsx');
    expect(src).toMatch(/actionFilter/);
    expect(src).toMatch(/setActionFilter/);
  });

  it('audit page supports targetType filter', () => {
    const src = sourceWithoutComments('app/(app)/super-admin/audit/page.tsx');
    expect(src).toMatch(/targetTypeFilter/);
    expect(src).toMatch(/setTargetTypeFilter/);
  });

  it('audit page handles 403 by redirecting to step-up', () => {
    const src = sourceWithoutComments('app/(app)/super-admin/audit/page.tsx');
    expect(src).toMatch(/403/);
    expect(src).toMatch(/clearSuperAdminSession/);
    expect(src).toMatch(/step-up/);
  });

  it('audit page renders loading state', () => {
    const src = sourceWithoutComments('app/(app)/super-admin/audit/page.tsx');
    expect(src).toMatch(/Loading audit logs/);
  });

  it('audit page renders empty state', () => {
    const src = sourceWithoutComments('app/(app)/super-admin/audit/page.tsx');
    expect(src).toMatch(/No audit events found/);
  });

  it('audit page renders error state', () => {
    const src = sourceWithoutComments('app/(app)/super-admin/audit/page.tsx');
    expect(src).toMatch(/Failed to load audit logs/);
  });

  it('audit page renders audit event columns', () => {
    const src = sourceWithoutComments('app/(app)/super-admin/audit/page.tsx');
    expect(src).toMatch(/Timestamp/);
    expect(src).toMatch(/Action/);
    expect(src).toMatch(/Actor/);
    expect(src).toMatch(/Target/);
    expect(src).toMatch(/Details/);
  });

  it('audit page supports load more pagination', () => {
    const src = sourceWithoutComments('app/(app)/super-admin/audit/page.tsx');
    expect(src).toMatch(/hasNextPage/);
    expect(src).toMatch(/Load More/);
  });

  it('audit page displays audit event details', () => {
    const src = sourceWithoutComments('app/(app)/super-admin/audit/page.tsx');
    expect(src).toMatch(/createdAt/);
    expect(src).toMatch(/actorUserId/);
    expect(src).toMatch(/targetType/);
    expect(src).toMatch(/targetId/);
    expect(src).toMatch(/action/);
    expect(src).toMatch(/details/);
  });

  it('audit page never persists secrets to localStorage', () => {
    const src = sourceWithoutComments('app/(app)/super-admin/audit/page.tsx');
    expect(src).not.toMatch(/localStorage/);
    expect(src).not.toMatch(/sessionStorage/);
    expect(src).not.toMatch(/console\.log/);
  });
});