/**
 * Super Admin Dashboard Modules contracts.
 *
 * Asserts the four dashboard pages (Organizations, Users, Clients, Employees),
 * the centralized super-admin-api helper, and their shared patterns for:
 *   - API endpoint paths and query parameters
 *   - Session token header injection (X-Admin-Session-Token)
 *   - 403 handling and step-up redirect
 *   - Loading, empty, and error states
 *   - Cursor-based pagination
 *   - User phone exclusion (per Decision 020 §4)
 *   - Client notes and PII exclusion (per Decision 020 §4)
 *   - No secrets persisted in localStorage
 *   - No bypass of server-side authorization
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function sourceWithoutComments(relPath: string): string {
  const raw = readFileSync(join(__dirname, '..', relPath), 'utf8');
  return raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('Super Admin Dashboard Modules contracts', () => {
  // =========================================================================
  // Centralized API Helper Contracts
  // =========================================================================

  describe('super-admin-api centralized helper', () => {
    it('exports fetchOrganizations with correct endpoint', () => {
      const src = sourceWithoutComments('lib/super-admin-api.ts');
      expect(src).toMatch(/fetchOrganizations/);
      expect(src).toMatch(/\/admin\/organizations\?/);
      expect(src).toMatch(/GLOBAL_ORG_READ/);
    });

    it('exports fetchUsers with correct endpoint', () => {
      const src = sourceWithoutComments('lib/super-admin-api.ts');
      expect(src).toMatch(/fetchUsers/);
      expect(src).toMatch(/\/admin\/users\?/);
      expect(src).toMatch(/GLOBAL_USER_READ/);
    });

    it('exports fetchClients with correct endpoint', () => {
      const src = sourceWithoutComments('lib/super-admin-api.ts');
      expect(src).toMatch(/fetchClients/);
      expect(src).toMatch(/\/admin\/clients\?/);
      expect(src).toMatch(/GLOBAL_CLIENT_READ/);
    });

    it('exports fetchEmployees with correct endpoint', () => {
      const src = sourceWithoutComments('lib/super-admin-api.ts');
      expect(src).toMatch(/fetchEmployees/);
      expect(src).toMatch(/\/admin\/employees\?/);
      expect(src).toMatch(/GLOBAL_EMPLOYEE_READ/);
    });

    it('all fetch functions use cursor-based pagination params', () => {
      const src = sourceWithoutComments('lib/super-admin-api.ts');
      expect(src).toMatch(/searchParams\.set\('page'/);
      expect(src).toMatch(/searchParams\.set\('limit'/);
      expect(src).toMatch(/searchParams\.set\('cursor'/);
    });

    it('all fetch functions attach X-Admin-Session-Token header', () => {
      const src = sourceWithoutComments('lib/super-admin-api.ts');
      expect(src).toMatch(/X-Admin-Session-Token/);
      expect(src).toMatch(/loadSuperAdminSession/);
      expect(src).toMatch(/fetchWithAdminSession/);
    });

    it('super-admin-api never persists secrets to localStorage', () => {
      const src = sourceWithoutComments('lib/super-admin-api.ts');
      expect(src).not.toMatch(/localStorage/);
      expect(src).not.toMatch(/sessionStorage/);
      expect(src).not.toMatch(/console\.log/);
    });

    it('PlatformUser type excludes phone number field (Decision 020 §4)', () => {
      const src = sourceWithoutComments('lib/super-admin-api.ts');
      const userInterfaceMatch = src.match(/export interface PlatformUser \{[\s\S]*?\n\}/);
      expect(userInterfaceMatch).toBeTruthy();
      if (userInterfaceMatch) {
        // phoneVerifiedAt is a verification timestamp, not the phone number —
        // the excluded field is the actual phone: string value.
        expect(userInterfaceMatch[0]).not.toMatch(/phone:/);
        expect(userInterfaceMatch[0]).toMatch(/phoneVerifiedAt/);
      }
    });

    it('PlatformClient type excludes notes and PII fields (Decision 020 §4)', () => {
      const src = sourceWithoutComments('lib/super-admin-api.ts');
      const clientInterfaceMatch = src.match(/export interface PlatformClient \{[\s\S]*?\n\}/);
      expect(clientInterfaceMatch).toBeTruthy();
      if (clientInterfaceMatch) {
        expect(clientInterfaceMatch[0]).not.toMatch(/notes/);
        expect(clientInterfaceMatch[0]).not.toMatch(/directEmail/);
        expect(clientInterfaceMatch[0]).not.toMatch(/directPhone/);
        expect(clientInterfaceMatch[0]).not.toMatch(/primaryContact/);
        expect(clientInterfaceMatch[0]).not.toMatch(/address/);
      }
    });

    it('PlatformEmployee type includes phone (not excluded)', () => {
      const src = sourceWithoutComments('lib/super-admin-api.ts');
      const employeeInterfaceMatch = src.match(/export interface PlatformEmployee \{[\s\S]*?\n\}/);
      expect(employeeInterfaceMatch).toBeTruthy();
      if (employeeInterfaceMatch) {
        expect(employeeInterfaceMatch[0]).toMatch(/phone/);
      }
    });

    it('returns paginated response with meta (total, hasNextPage, hasPrevPage)', () => {
      const src = sourceWithoutComments('lib/super-admin-api.ts');
      expect(src).toMatch(/PaginatedOrganizations/);
      expect(src).toMatch(/PaginatedUsers/);
      expect(src).toMatch(/PaginatedClients/);
      expect(src).toMatch(/PaginatedEmployees/);
      expect(src).toMatch(/hasNextPage/);
      expect(src).toMatch(/hasPrevPage/);
      expect(src).toMatch(/total/);
    });
  });

  // =========================================================================
  // Organizations Page Contracts
  // =========================================================================

  describe('Organizations page', () => {
    it('integrates fetchOrganizations from super-admin-api', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/organizations/page.tsx');
      expect(src).toMatch(/fetchOrganizations/);
      expect(src).toMatch(/from.*super-admin-api/);
    });

    it('uses TanStack Query with correct query key', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/organizations/page.tsx');
      expect(src).toMatch(/useQuery/);
      expect(src).toMatch(/queryKey.*superadmin.*organizations/);
    });

    it('handles 403 by redirecting to step-up', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/organizations/page.tsx');
      expect(src).toMatch(/403/);
      expect(src).toMatch(/clearSuperAdminSession/);
      expect(src).toMatch(/step-up/);
      expect(src).toMatch(/ApiError/);
    });

    it('renders loading state', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/organizations/page.tsx');
      expect(src).toMatch(/Loading organizations/);
    });

    it('renders empty state', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/organizations/page.tsx');
      expect(src).toMatch(/No organizations found/);
    });

    it('renders error state', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/organizations/page.tsx');
      expect(src).toMatch(/ApiError/);
    });

    it('displays organization columns: Name, Slug, Kind, Discovery, Status, Created', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/organizations/page.tsx');
      expect(src).toMatch(/Name/);
      expect(src).toMatch(/Slug/);
      expect(src).toMatch(/Kind/);
      expect(src).toMatch(/Discovery/);
      expect(src).toMatch(/Status/);
      expect(src).toMatch(/Created/);
      expect(src).toMatch(/data\?\.meta\.total/);
    });

    it('shows discovery opt-in badge', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/organizations/page.tsx');
      expect(src).toMatch(/discoveryOptIn/);
      expect(src).toMatch(/Opted In/);
    });

    it('shows active/inactive status badge', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/organizations/page.tsx');
      expect(src).toMatch(/isActive/);
      expect(src).toMatch(/Active.*Inactive/);
    });

    it('never persists secrets to localStorage', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/organizations/page.tsx');
      expect(src).not.toMatch(/localStorage/);
      expect(src).not.toMatch(/sessionStorage/);
      expect(src).not.toMatch(/console\.log/);
    });

    it('includes back navigation to overview', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/organizations/page.tsx');
      expect(src).toMatch(/Back to Overview/);
      expect(src).toMatch(/href.*super-admin/);
    });

    it('includes search input', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/organizations/page.tsx');
      expect(src).toMatch(/Search organizations/);
      expect(src).toMatch(/Input/);
    });
  });

  // =========================================================================
  // Users Page Contracts
  // =========================================================================

  describe('Users page', () => {
    it('integrates fetchUsers from super-admin-api', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/users/page.tsx');
      expect(src).toMatch(/fetchUsers/);
      expect(src).toMatch(/from.*super-admin-api/);
    });

    it('uses TanStack Query with correct query key', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/users/page.tsx');
      expect(src).toMatch(/useQuery/);
      expect(src).toMatch(/queryKey.*superadmin.*users/);
    });

    it('handles 403 by redirecting to step-up', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/users/page.tsx');
      expect(src).toMatch(/403/);
      expect(src).toMatch(/clearSuperAdminSession/);
      expect(src).toMatch(/step-up/);
      expect(src).toMatch(/ApiError/);
    });

    it('renders loading state', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/users/page.tsx');
      expect(src).toMatch(/Loading users/);
    });

    it('renders empty state', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/users/page.tsx');
      expect(src).toMatch(/No users found/);
    });

    it('displays user columns: Name, Email, Account Type, Role/Flag, Status, Created', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/users/page.tsx');
      expect(src).toMatch(/User/);
      expect(src).toMatch(/Account Type/);
      expect(src).toMatch(/Role/);
      expect(src).toMatch(/Status/);
      expect(src).toMatch(/Created/);
      expect(src).toMatch(/data\?\.meta\.total/);
    });

    it('shows SuperAdmin badge when isSocialOpsAdmin is true', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/users/page.tsx');
      expect(src).toMatch(/isSocialOpsAdmin/);
      expect(src).toMatch(/SuperAdmin/);
    });

    it('shows account type badge', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/users/page.tsx');
      expect(src).toMatch(/accountType/);
      expect(src).toMatch(/Employee/);
    });

    it('shows active/inactive status badge', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/users/page.tsx');
      expect(src).toMatch(/isActive/);
    });

    it('EXCLUDES phone field from display (Decision 020 §4)', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/users/page.tsx');
      expect(src).not.toMatch(/user\.phone/);
      expect(src).not.toMatch(/user\.phoneVerifiedAt/);
      // No Phone column header and no phone value rendering in the table body
      expect(src).not.toMatch(/>Phone<\/th>/);
      expect(src).not.toMatch(/{user\.phone/);
    });

    it('never persists secrets to localStorage', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/users/page.tsx');
      expect(src).not.toMatch(/localStorage/);
      expect(src).not.toMatch(/sessionStorage/);
      expect(src).not.toMatch(/console\.log/);
    });

    it('includes back navigation to overview', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/users/page.tsx');
      expect(src).toMatch(/Back to Overview/);
    });

    it('includes search input', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/users/page.tsx');
      expect(src).toMatch(/Search users/);
      expect(src).toMatch(/Input/);
    });
  });

  // =========================================================================
  // Clients Page Contracts
  // =========================================================================

  describe('Clients page', () => {
    it('integrates fetchClients from super-admin-api', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/clients/page.tsx');
      expect(src).toMatch(/fetchClients/);
      expect(src).toMatch(/from.*super-admin-api/);
    });

    it('uses TanStack Query with correct query key', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/clients/page.tsx');
      expect(src).toMatch(/useQuery/);
      expect(src).toMatch(/queryKey.*superadmin.*clients/);
    });

    it('handles 403 by redirecting to step-up', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/clients/page.tsx');
      expect(src).toMatch(/403/);
      expect(src).toMatch(/clearSuperAdminSession/);
      expect(src).toMatch(/step-up/);
      expect(src).toMatch(/ApiError/);
    });

    it('renders loading state', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/clients/page.tsx');
      expect(src).toMatch(/Loading clients/);
    });

    it('renders empty state', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/clients/page.tsx');
      expect(src).toMatch(/No clients found/);
    });

    it('displays client columns: Name, Industry, Type, Onboarding, Status, Created', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/clients/page.tsx');
      expect(src).toMatch(/Name/);
      expect(src).toMatch(/Industry/);
      expect(src).toMatch(/Type/);
      expect(src).toMatch(/Onboarding/);
      expect(src).toMatch(/Status/);
      expect(src).toMatch(/Created/);
      expect(src).toMatch(/data\?\.meta\.total/);
    });

    it('shows client type badge (INDIVIDUAL/BUSINESS)', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/clients/page.tsx');
      expect(src).toMatch(/client\.type/);
      // Badge renders the raw enum value from the backend PlatformClient.type
      expect(src).toMatch(/{client\.type}/);
    });

    it('shows onboarding status badge', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/clients/page.tsx');
      expect(src).toMatch(/onboardingStatus/);
      expect(src).toMatch(/ACTIVE|PENDING/);
    });

    it('shows client status badge (ACTIVE/INACTIVE/SUSPENDED)', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/clients/page.tsx');
      expect(src).toMatch(/client\.status/);
      expect(src).toMatch(/ACTIVE|INACTIVE|SUSPENDED/);
    });

    it('EXCLUDES notes and PII fields from display (Decision 020 §4)', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/clients/page.tsx');
      expect(src).not.toMatch(/client\.notes/);
      expect(src).not.toMatch(/client\.directEmail/);
      expect(src).not.toMatch(/client\.directPhone/);
      expect(src).not.toMatch(/client\.primaryContact/);
      expect(src).not.toMatch(/client\.address/);
      // No column header or cell rendering for any PII field
      expect(src).not.toMatch(/>Notes<\/th>/);
      expect(src).not.toMatch(/>Email<\/th>/);
      expect(src).not.toMatch(/>Phone<\/th>/);
    });

    it('never persists secrets to localStorage', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/clients/page.tsx');
      expect(src).not.toMatch(/localStorage/);
      expect(src).not.toMatch(/sessionStorage/);
      expect(src).not.toMatch(/console\.log/);
    });

    it('includes back navigation to overview', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/clients/page.tsx');
      expect(src).toMatch(/Back to Overview/);
    });

    it('includes search input', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/clients/page.tsx');
      expect(src).toMatch(/Search clients/);
      expect(src).toMatch(/Input/);
    });
  });

  // =========================================================================
  // Employees Page Contracts
  // =========================================================================

  describe('Employees page', () => {
    it('integrates fetchEmployees from super-admin-api', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/employees/page.tsx');
      expect(src).toMatch(/fetchEmployees/);
      expect(src).toMatch(/from.*super-admin-api/);
    });

    it('uses TanStack Query with correct query key', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/employees/page.tsx');
      expect(src).toMatch(/useQuery/);
      expect(src).toMatch(/queryKey.*superadmin.*employees/);
    });

    it('handles 403 by redirecting to step-up', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/employees/page.tsx');
      expect(src).toMatch(/403/);
      expect(src).toMatch(/clearSuperAdminSession/);
      expect(src).toMatch(/step-up/);
      expect(src).toMatch(/ApiError/);
    });

    it('renders loading state', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/employees/page.tsx');
      expect(src).toMatch(/Loading employees/);
    });

    it('renders empty state', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/employees/page.tsx');
      expect(src).toMatch(/No employees found/);
    });

    it('displays employee columns: Name, Email, Phone, Profile ID, Created', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/employees/page.tsx');
      expect(src).toMatch(/Name/);
      expect(src).toMatch(/Email/);
      expect(src).toMatch(/Phone/);
      expect(src).toMatch(/Profile ID/);
      expect(src).toMatch(/Created/);
      expect(src).toMatch(/data\?\.meta\.total/);
    });

    it('shows phone number (employees page includes phone)', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/employees/page.tsx');
      expect(src).toMatch(/employee\.phone/);
      expect(src).toMatch(/Phone/);
    });

    it('shows employee profile ID', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/employees/page.tsx');
      expect(src).toMatch(/employee\.id/);
      expect(src).toMatch(/Profile ID/);
    });

    it('never persists secrets to localStorage', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/employees/page.tsx');
      expect(src).not.toMatch(/localStorage/);
      expect(src).not.toMatch(/sessionStorage/);
      expect(src).not.toMatch(/console\.log/);
    });

    it('includes back navigation to overview', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/employees/page.tsx');
      expect(src).toMatch(/Back to Overview/);
    });

    it('includes search input', () => {
      const src = sourceWithoutComments('app/(app)/super-admin/employees/page.tsx');
      expect(src).toMatch(/Search employees/);
      expect(src).toMatch(/Input/);
    });
  });

  // =========================================================================
  // Shared Patterns Across All Four Pages
  // =========================================================================

  describe('Shared patterns across all four dashboard pages', () => {
    const pages = [
      'app/(app)/super-admin/organizations/page.tsx',
      'app/(app)/super-admin/users/page.tsx',
      'app/(app)/super-admin/clients/page.tsx',
      'app/(app)/super-admin/employees/page.tsx',
    ];

    for (const page of pages) {
      it(`${page} uses the centralized super-admin-api helper`, () => {
        const src = sourceWithoutComments(page);
        expect(src).toMatch(/from.*super-admin-api/);
      });

      it(`${page} uses useQuery from @tanstack/react-query`, () => {
        const src = sourceWithoutComments(page);
        expect(src).toMatch(/useQuery/);
        expect(src).toMatch(/@tanstack\/react-query/);
      });

      it(`${page} handles 403 with step-up redirect`, () => {
        const src = sourceWithoutComments(page);
        expect(src).toMatch(/403/);
        expect(src).toMatch(/clearSuperAdminSession/);
        expect(src).toMatch(/step-up/);
        expect(src).toMatch(/ApiError/);
      });

      it(`${page} renders loading state`, () => {
        const src = sourceWithoutComments(page);
        expect(src).toMatch(/isLoading/);
        expect(src).toMatch(/Loading/);
      });

      it(`${page} renders empty state`, () => {
        const src = sourceWithoutComments(page);
        expect(src).toMatch(/No .* found/);
      });

      it(`${page} never persists secrets to localStorage`, () => {
        const src = sourceWithoutComments(page);
        expect(src).not.toMatch(/localStorage/);
        expect(src).not.toMatch(/sessionStorage/);
        expect(src).not.toMatch(/console\.log/);
      });

      it(`${page} includes back navigation`, () => {
        const src = sourceWithoutComments(page);
        expect(src).toMatch(/Back to Overview/);
        expect(src).toMatch(/href.*super-admin/);
      });

      it(`${page} includes search input`, () => {
        const src = sourceWithoutComments(page);
        expect(src).toMatch(/Search/);
        expect(src).toMatch(/Input/);
      });

      it(`${page} uses Card, Table components from UI library`, () => {
        const src = sourceWithoutComments(page);
        expect(src).toMatch(/Card/);
        expect(src).toMatch(/table/);
        expect(src).toMatch(/tbody/);
        expect(src).toMatch(/thead/);
      });

      it(`${page} shows total count in header`, () => {
        const src = sourceWithoutComments(page);
        expect(src).toMatch(/data\?\.meta\.total/);
      });
    }
  });
});