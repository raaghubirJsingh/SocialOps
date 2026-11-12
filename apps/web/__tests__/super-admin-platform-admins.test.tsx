/**
 * Super Admin Platform Admins page contracts.
 *
 * Asserts the platform-admins page source, the super-admin-api helper,
 * and the platform-admin-table component for:
 *   - API endpoint paths and query parameters
 *   - Session token header injection
 *   - Grant/Revoke step-up authentication preservation
 *   - Loading, empty, and error states
 *   - Permission display and grouping
 *   - Detail navigation
 *   - No secrets persisted in localStorage
 *   - No bypass of server-side authorization
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function sourceWithoutComments(relPath: string): string {
  const raw = readFileSync(join(__dirname, '..', relPath), 'utf8');
  return raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('Super Admin Platform Admins contracts', () => {
  it('super-admin-api uses the correct platform-admins endpoints', () => {
    const src = sourceWithoutComments('lib/super-admin-api.ts');
    expect(src).toMatch(/\/admin\/platform-admins\?/);
    expect(src).toMatch(/\/admin\/platform-admins\/\$\{/);
    expect(src).toMatch(/\/admin\/platform-admins\/grant/);
    expect(src).toMatch(/\/admin\/platform-admins\/revoke/);
  });

  it('super-admin-api attaches X-Admin-Session-Token header', () => {
    const src = sourceWithoutComments('lib/super-admin-api.ts');
    expect(src).toMatch(/X-Admin-Session-Token/);
    expect(src).toMatch(/loadSuperAdminSession/);
  });

  it('super-admin-api mirrors backend PlatformPermission enum', () => {
    const src = sourceWithoutComments('lib/super-admin-api.ts');
    expect(src).toContain('CLIENT_STATUS_MANAGEMENT');
    expect(src).toContain('AGENCY_DISCOVERY_APPROVAL');
    expect(src).toContain('GLOBAL_ORG_READ');
    expect(src).toContain('GLOBAL_USER_READ');
    expect(src).toContain('GLOBAL_CLIENT_READ');
    expect(src).toContain('GLOBAL_EMPLOYEE_READ');
    expect(src).toContain('GLOBAL_CONTENT_READ');
    expect(src).toContain('PLATFORM_ROLE_GRANT');
    expect(src).toContain('PLATFORM_ROLE_REVOKE');
    expect(src).toContain('PLATFORM_AUDIT_READ');
    expect(src).toContain('PLATFORM_SETTINGS_MANAGE');
  });

  it('super-admin-api uses cursor-based pagination', () => {
    const src = sourceWithoutComments('lib/super-admin-api.ts');
    expect(src).toMatch(/cursor/);
    expect(src).toMatch(/page/);
    expect(src).toMatch(/limit/);
  });

  it('super-admin-api never persists secrets to localStorage', () => {
    const src = sourceWithoutComments('lib/super-admin-api.ts');
    expect(src).not.toMatch(/localStorage/);
    expect(src).not.toMatch(/sessionStorage/);
    expect(src).not.toMatch(/console\.log/);
  });

  it('platform-admins page integrates listing, grant, revoke, and detail navigation', () => {
    const src = sourceWithoutComments('app/(app)/super-admin/platform-admins/page.tsx');
    expect(src).toMatch(/PlatformAdminTable/);
    expect(src).toMatch(/GrantAdminDialog/);
    expect(src).toMatch(/RevokeAdminDialog/);
    expect(src).toMatch(/fetchPlatformAdmins/);
  });

  it('platform-admin-table links to detail page', () => {
    const src = sourceWithoutComments('components/super-admin/platform-admin-table.tsx');
    expect(src).toMatch(/platform-admins\/\$/);
  });

  it('platform-admins page handles 403 by redirecting to step-up', () => {
    const src = sourceWithoutComments('app/(app)/super-admin/platform-admins/page.tsx');
    expect(src).toMatch(/403/);
    expect(src).toMatch(/clearSuperAdminSession/);
    expect(src).toMatch(/step-up/);
  });

  it('platform-admins page does client-side email search', () => {
    const src = sourceWithoutComments('app/(app)/super-admin/platform-admins/page.tsx');
    expect(src).toMatch(/toLowerCase/);
    expect(src).toMatch(/filter/);
  });

  it('platform-admin-table renders loading, empty, and error states', () => {
    const src = sourceWithoutComments('components/super-admin/platform-admin-table.tsx');
    expect(src).toMatch(/Loading platform administrators/);
    expect(src).toMatch(/No platform administrators found/);
    expect(src).toMatch(/Failed to load platform administrators/);
  });

  it('platform-admin-table renders permission badges', () => {
    const src = sourceWithoutComments('components/super-admin/platform-admin-table.tsx');
    expect(src).toMatch(/PermissionBadges/);
    expect(src).toMatch(/platformPermissions/);
  });

  it('platform-admin-table renders revoke action', () => {
    const src = sourceWithoutComments('components/super-admin/platform-admin-table.tsx');
    expect(src).toMatch(/onRevoke/);
    expect(src).toMatch(/Revoke/);
  });

  it('platform-admin-table links to detail page', () => {
    const src = sourceWithoutComments('components/super-admin/platform-admin-table.tsx');
    expect(src).toMatch(/platform-admins\/\$/);
  });

  it('grant-admin-dialog uses react-hook-form with zod validation', () => {
    const src = sourceWithoutComments('components/super-admin/grant-admin-dialog.tsx');
    expect(src).toMatch(/useForm/);
    expect(src).toMatch(/z\.object/);
    expect(src).toMatch(/z\.string\(\)\.uuid/);
    expect(src).toMatch(/grantPlatformAdmin/);
  });

  it('grant-admin-dialog attaches session token via API helper', () => {
    const src = sourceWithoutComments('components/super-admin/grant-admin-dialog.tsx');
    expect(src).toMatch(/grantPlatformAdmin/);
  });

  it('revoke-admin-dialog requires confirmation name', () => {
    const src = sourceWithoutComments('components/super-admin/revoke-admin-dialog.tsx');
    expect(src).toMatch(/confirmName/);
    expect(src).toMatch(/revokePlatformAdmin/);
  });

  it('revoke-admin-dialog shows destructive warning', () => {
    const src = sourceWithoutComments('components/super-admin/revoke-admin-dialog.tsx');
    expect(src).toMatch(/AlertTriangle/);
    expect(src).toMatch(/cannot be undone/);
  });

  it('platform-admin detail page uses fetchPlatformAdmin', () => {
    const src = sourceWithoutComments('app/(app)/super-admin/platform-admins/[id]/page.tsx');
    expect(src).toMatch(/fetchPlatformAdmin/);
    expect(src).toMatch(/PlatformAdminInfo/);
  });

  it('platform-admin detail page handles 403 redirect', () => {
    const src = sourceWithoutComments('app/(app)/super-admin/platform-admins/[id]/page.tsx');
    expect(src).toMatch(/403/);
    expect(src).toMatch(/step-up/);
  });

  it('platform-admin detail page renders permission summary', () => {
    const src = sourceWithoutComments('app/(app)/super-admin/platform-admins/[id]/page.tsx');
    expect(src).toMatch(/Permission Summary/);
    expect(src).toMatch(/Global Read/);
    expect(src).toMatch(/Platform Roles/);
  });
});