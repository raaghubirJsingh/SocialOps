import { apiFetch, type ApiFetchInit } from './api';
import { loadSuperAdminSession } from './super-admin-session';

/**
 * Platform Permission enum (mirrors Prisma enum).
 * Keep in sync with backend: apps/api/prisma/schema.prisma
 */
export type PlatformPermission =
  | 'CLIENT_STATUS_MANAGEMENT'
  | 'AGENCY_DISCOVERY_APPROVAL'
  | 'GLOBAL_ORG_READ'
  | 'GLOBAL_USER_READ'
  | 'GLOBAL_CLIENT_READ'
  | 'GLOBAL_EMPLOYEE_READ'
  | 'GLOBAL_CONTENT_READ'
  | 'PLATFORM_ROLE_GRANT'
  | 'PLATFORM_ROLE_REVOKE'
  | 'PLATFORM_AUDIT_READ'
  | 'PLATFORM_SETTINGS_MANAGE';

/**
 * All platform permissions (mirrors backend ALL_PLATFORM_PERMISSIONS).
 * Used as default when granting platform admin without explicit permissions.
 */
export const ALL_PLATFORM_PERMISSIONS: PlatformPermission[] = [
  'CLIENT_STATUS_MANAGEMENT',
  'AGENCY_DISCOVERY_APPROVAL',
  'GLOBAL_ORG_READ',
  'GLOBAL_USER_READ',
  'GLOBAL_CLIENT_READ',
  'GLOBAL_EMPLOYEE_READ',
  'GLOBAL_CONTENT_READ',
  'PLATFORM_ROLE_GRANT',
  'PLATFORM_ROLE_REVOKE',
  'PLATFORM_AUDIT_READ',
  'PLATFORM_SETTINGS_MANAGE',
];

/**
 * Platform Admin info as returned by backend.
 * Mirrors PlatformAdminInfo from platform-admin.service.ts
 */
export interface PlatformAdminInfo {
  id: string;
  email: string;
  fullName: string | null;
  isSocialOpsAdmin: boolean;
  platformPermissions: PlatformPermission[];
  socialOpsAdminGrantedAt: string | null; // ISO date string
  socialOpsAdminGrantedById: string | null;
  socialOpsAdminRevokedAt: string | null;
}

/**
 * Paginated platform admins response.
 * Mirrors PaginatedPlatformAdmins from platform-admin.service.ts
 */
export interface PaginatedPlatformAdmins {
  data: PlatformAdminInfo[];
  meta: {
    page: number;
    limit: number;
    total: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

/**
 * Grant platform admin request DTO.
 * Mirrors GrantPlatformAdminDto from platform-admin.dto.ts
 */
export interface GrantPlatformAdminRequest {
  userId: string; // UUID
  permissions?: PlatformPermission[];
}

/**
 * Revoke platform admin request DTO.
 * Mirrors RevokePlatformAdminDto from platform-admin.dto.ts
 */
export interface RevokePlatformAdminRequest {
  userId: string; // UUID
}

/**
 * Audit log entry (AdminAuditEvent from Prisma).
 * Mirrors AdminAuditEvent from backend.
 */
export interface AdminAuditEvent {
  id: string;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  details: Record<string, unknown> | null;
  createdAt: string; // ISO date string
}

/**
 * Paginated audit logs response.
 * Mirrors listAuditLogs return type from platform-admin.service.ts
 */
export interface PaginatedAuditLogs {
  data: AdminAuditEvent[];
  meta: {
    page: number;
    limit: number;
    total: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

/**
 * Query parameters for fetching platform admins.
 * Mirrors PlatformAdminListQueryDto from platform-admin.dto.ts
 */
export interface FetchPlatformAdminsParams {
  page?: number;
  limit?: number;
  cursor?: string;
}

/**
 * Query parameters for fetching audit logs.
 */
export interface FetchAuditLogsParams {
  page?: number;
  limit?: number;
  cursor?: string;
  action?: string;
  targetType?: string;
}

/**
 * Organization as returned by backend (SAFE select - no sensitive fields).
 * Mirrors PlatformAdminOrganizationsService.ORG_SELECT.
 */
export interface PlatformOrganization {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  kind: 'AGENCY' | 'SOCIALOPS';
  discoveryOptIn: boolean;
  discoveryApprovedAt: string | null;
  discoveryApprovedByUserId: string | null;
  createdAt: string; // ISO date string
  updatedAt: string; // ISO date string
}

/**
 * Paginated organizations response.
 */
export interface PaginatedOrganizations {
  data: PlatformOrganization[];
  meta: {
    page: number;
    limit: number;
    total: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

/**
 * Query parameters for fetching organizations.
 */
export interface FetchOrganizationsParams {
  page?: number;
  limit?: number;
  cursor?: string;
}

/**
 * User as returned by backend (SAFE select - excludes phone, passwordHash, tokens).
 * Mirrors PlatformAdminUsersService.USER_SELECT.
 */
export interface PlatformUser {
  id: string;
  email: string;
  displayName: string | null;
  fullName: string | null;
  accountType: string | null;
  clientType: string | null;
  isActive: boolean;
  emailVerifiedAt: string | null;
  phoneVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  isBot: boolean;
  skillSpecialization: string | null;
  isSocialOpsAdmin: boolean;
  socialOpsAdminGrantedAt: string | null;
  socialOpsAdminGrantedById: string | null;
  socialOpsAdminRevokedAt: string | null;
  platformPermissions: PlatformPermission[];
  memberships: { organizationId: string; role: string }[];
}

/**
 * Paginated users response.
 */
export interface PaginatedUsers {
  data: PlatformUser[];
  meta: {
    page: number;
    limit: number;
    total: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

/**
 * Query parameters for fetching users.
 */
export interface FetchUsersParams {
  page?: number;
  limit?: number;
  cursor?: string;
}

/**
 * Client as returned by backend (SAFE select - excludes PII and notes).
 * Mirrors PlatformAdminClientsService.SAFE_CLIENT_SELECT.
 */
export interface PlatformClient {
  id: string;
  name: string;
  type: 'INDIVIDUAL' | 'BUSINESS';
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  onboardingStatus: 'PENDING' | 'ACTIVE';
  description: string | null;
  website: string | null;
  industry: string | null;
  logoUrl: string | null;
  createdAt: string;
  updatedAt: string;
  ownerUserId: string | null;
  statusReason: string | null;
  statusChangedAt: string | null;
}

/**
 * Paginated clients response.
 */
export interface PaginatedClients {
  data: PlatformClient[];
  meta: {
    page: number;
    limit: number;
    total: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

/**
 * Query parameters for fetching clients.
 */
export interface FetchClientsParams {
  page?: number;
  limit?: number;
  cursor?: string;
}

/**
 * Employee profile as returned by backend.
 * Mirrors PlatformAdminEmployeesService listAll return type.
 */
export interface PlatformEmployee {
  id: string;
  userId: string;
  fullName: string | null;
  email: string;
  phone: string | null;
  createdAt: string; // ISO date string
  updatedAt: string; // ISO date string
}

/**
 * Paginated employees response.
 */
export interface PaginatedEmployees {
  data: PlatformEmployee[];
  meta: {
    page: number;
    limit: number;
    total: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

/**
 * Query parameters for fetching employees.
 */
export interface FetchEmployeesParams {
  page?: number;
  limit?: number;
  cursor?: string;
}

/**
 * Internal helper: attaches the super admin session token header.
 * Uses the same pattern as fetchWithSessionToken in organizations/page.tsx
 */
async function fetchWithAdminSession<T>(
  path: string,
  init: ApiFetchInit = {}
): Promise<T> {
  const sessionData = loadSuperAdminSession();
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string>),
    'X-Admin-Session-Token': sessionData?.sessionToken ?? '',
  };
  return apiFetch<T>(path, {
    ...init,
    headers,
  });
}

/**
 * Fetch paginated list of platform administrators.
 * GET /admin/platform-admins
 * Requires: PLATFORM_ROLE_GRANT + PLATFORM_ROLE_REVOKE permissions + step-up session
 */
export async function fetchPlatformAdmins(
  params: FetchPlatformAdminsParams = {}
): Promise<PaginatedPlatformAdmins> {
  const { page = 1, limit = 25, cursor } = params;
  const searchParams = new URLSearchParams();
  searchParams.set('page', String(page));
  searchParams.set('limit', String(limit));
  if (cursor) searchParams.set('cursor', cursor);

  return fetchWithAdminSession<PaginatedPlatformAdmins>(
    `/admin/platform-admins?${searchParams.toString()}`
  );
}

/**
 * Fetch a single platform administrator by ID.
 * GET /admin/platform-admins/:id
 * Requires: PLATFORM_ROLE_GRANT + PLATFORM_ROLE_REVOKE permissions + step-up session
 */
export async function fetchPlatformAdmin(
  id: string
): Promise<PlatformAdminInfo | null> {
  return fetchWithAdminSession<PlatformAdminInfo | null>(
    `/admin/platform-admins/${id}`
  );
}

/**
 * Grant platform admin privileges to a user.
 * POST /admin/platform-admins/grant
 * Requires: PLATFORM_ROLE_GRANT permission + step-up session
 * Returns the granted admin info with 201 status
 */
export async function grantPlatformAdmin(
  request: GrantPlatformAdminRequest
): Promise<PlatformAdminInfo> {
  return fetchWithAdminSession<PlatformAdminInfo>('/admin/platform-admins/grant', {
    method: 'POST',
    body: request,
  });
}

/**
 * Revoke platform admin privileges from a user.
 * POST /admin/platform-admins/revoke
 * Requires: PLATFORM_ROLE_REVOKE permission + step-up session
 * Returns the revoked admin info with 200 status
 */
export async function revokePlatformAdmin(
  request: RevokePlatformAdminRequest
): Promise<PlatformAdminInfo> {
  return fetchWithAdminSession<PlatformAdminInfo>('/admin/platform-admins/revoke', {
    method: 'POST',
    body: request,
  });
}

/**
 * Fetch paginated cross-tenant audit logs.
 * GET /admin/audit-logs
 * Requires: PLATFORM_AUDIT_READ permission + step-up session
 */
export async function fetchAuditLogs(
  params: FetchAuditLogsParams = {}
): Promise<PaginatedAuditLogs> {
  const { page = 1, limit = 25, cursor, action, targetType } = params;
  const searchParams = new URLSearchParams();
  searchParams.set('page', String(page));
  searchParams.set('limit', String(limit));
  if (cursor) searchParams.set('cursor', cursor);
  if (action) searchParams.set('action', action);
  if (targetType) searchParams.set('targetType', targetType);

  return fetchWithAdminSession<PaginatedAuditLogs>(
    `/admin/audit-logs?${searchParams.toString()}`
  );
}

/**
 * Fetch paginated cross-tenant organizations.
 * GET /admin/organizations
 * Requires: GLOBAL_ORG_READ permission + step-up session
 */
export async function fetchOrganizations(
  params: FetchOrganizationsParams = {}
): Promise<PaginatedOrganizations> {
  const { page = 1, limit = 25, cursor } = params;
  const searchParams = new URLSearchParams();
  searchParams.set('page', String(page));
  searchParams.set('limit', String(limit));
  if (cursor) searchParams.set('cursor', cursor);

  return fetchWithAdminSession<PaginatedOrganizations>(
    `/admin/organizations?${searchParams.toString()}`
  );
}

/**
 * Fetch a single organization by ID.
 * GET /admin/organizations/:id
 * Requires: GLOBAL_ORG_READ permission + step-up session
 */
export async function fetchOrganization(
  id: string
): Promise<PlatformOrganization | null> {
  return fetchWithAdminSession<PlatformOrganization | null>(
    `/admin/organizations/${id}`
  );
}

/**
 * Fetch paginated cross-tenant users.
 * GET /admin/users
 * Requires: GLOBAL_USER_READ permission + step-up session
 * Note: User.phone is intentionally excluded per Decision 020 §4.
 */
export async function fetchUsers(
  params: FetchUsersParams = {}
): Promise<PaginatedUsers> {
  const { page = 1, limit = 25, cursor } = params;
  const searchParams = new URLSearchParams();
  searchParams.set('page', String(page));
  searchParams.set('limit', String(limit));
  if (cursor) searchParams.set('cursor', cursor);

  return fetchWithAdminSession<PaginatedUsers>(
    `/admin/users?${searchParams.toString()}`
  );
}

/**
 * Fetch a single user by ID.
 * GET /admin/users/:id
 * Requires: GLOBAL_USER_READ permission + step-up session
 * Note: User.phone is intentionally excluded per Decision 020 §4.
 */
export async function fetchUser(
  id: string
): Promise<PlatformUser | null> {
  return fetchWithAdminSession<PlatformUser | null>(
    `/admin/users/${id}`
  );
}

/**
 * Fetch paginated cross-tenant clients.
 * GET /admin/clients
 * Requires: GLOBAL_CLIENT_READ permission + step-up session
 * Note: Client.notes and PII are intentionally excluded per Decision 020 §4.
 */
export async function fetchClients(
  params: FetchClientsParams = {}
): Promise<PaginatedClients> {
  const { page = 1, limit = 25, cursor } = params;
  const searchParams = new URLSearchParams();
  searchParams.set('page', String(page));
  searchParams.set('limit', String(limit));
  if (cursor) searchParams.set('cursor', cursor);

  return fetchWithAdminSession<PaginatedClients>(
    `/admin/clients?${searchParams.toString()}`
  );
}

/**
 * Fetch a single client by ID.
 * GET /admin/clients/:id
 * Requires: GLOBAL_CLIENT_READ permission + step-up session
 * Note: Client.notes and PII are intentionally excluded per Decision 020 §4.
 */
export async function fetchClient(
  id: string
): Promise<PlatformClient | null> {
  return fetchWithAdminSession<PlatformClient | null>(
    `/admin/clients/${id}`
  );
}

/**
 * Fetch paginated cross-tenant employee profiles.
 * GET /admin/employees
 * Requires: GLOBAL_EMPLOYEE_READ permission + step-up session
 */
export async function fetchEmployees(
  params: FetchEmployeesParams = {}
): Promise<PaginatedEmployees> {
  const { page = 1, limit = 25, cursor } = params;
  const searchParams = new URLSearchParams();
  searchParams.set('page', String(page));
  searchParams.set('limit', String(limit));
  if (cursor) searchParams.set('cursor', cursor);

  return fetchWithAdminSession<PaginatedEmployees>(
    `/admin/employees?${searchParams.toString()}`
  );
}

/**
 * Fetch a single employee profile by ID.
 * GET /admin/employees/:id
 * Requires: GLOBAL_EMPLOYEE_READ permission + step-up session
 */
export async function fetchEmployee(
  id: string
): Promise<PlatformEmployee | null> {
  return fetchWithAdminSession<PlatformEmployee | null>(
    `/admin/employees/${id}`
  );
}

/**
 * Permission label mapping for display.
 * Converts enum values to human-readable labels.
 */
export function getPermissionLabel(permission: PlatformPermission): string {
  const labels: Record<PlatformPermission, string> = {
    CLIENT_STATUS_MANAGEMENT: 'Client Status Management',
    AGENCY_DISCOVERY_APPROVAL: 'Agency Discovery Approval',
    GLOBAL_ORG_READ: 'Global Organization Read',
    GLOBAL_USER_READ: 'Global User Read',
    GLOBAL_CLIENT_READ: 'Global Client Read',
    GLOBAL_EMPLOYEE_READ: 'Global Employee Read',
    GLOBAL_CONTENT_READ: 'Global Content Read',
    PLATFORM_ROLE_GRANT: 'Platform Role Grant',
    PLATFORM_ROLE_REVOKE: 'Platform Role Revoke',
    PLATFORM_AUDIT_READ: 'Platform Audit Read',
    PLATFORM_SETTINGS_MANAGE: 'Platform Settings Manage',
  };
  return labels[permission] ?? permission;
}

/**
 * Get short permission key for display (e.g., in badges).
 */
export function getPermissionShortKey(permission: PlatformPermission): string {
  const shortKeys: Record<PlatformPermission, string> = {
    CLIENT_STATUS_MANAGEMENT: 'CLIENT_STATUS',
    AGENCY_DISCOVERY_APPROVAL: 'AGENCY_DISCOVERY',
    GLOBAL_ORG_READ: 'ORG_READ',
    GLOBAL_USER_READ: 'USER_READ',
    GLOBAL_CLIENT_READ: 'CLIENT_READ',
    GLOBAL_EMPLOYEE_READ: 'EMPLOYEE_READ',
    GLOBAL_CONTENT_READ: 'CONTENT_READ',
    PLATFORM_ROLE_GRANT: 'ROLE_GRANT',
    PLATFORM_ROLE_REVOKE: 'ROLE_REVOKE',
    PLATFORM_AUDIT_READ: 'AUDIT_READ',
    PLATFORM_SETTINGS_MANAGE: 'SETTINGS',
  };
  return shortKeys[permission] ?? permission;
}

/**
 * Group permissions by category for organized display.
 */
export function groupPermissionsByCategory(
  permissions: PlatformPermission[]
): Record<string, PlatformPermission[]> {
  const categories: Record<string, PlatformPermission[]> = {
    'Global Read': [],
    'Platform Roles': [],
    'Platform Operations': [],
    'Client & Agency': [],
  };

  for (const perm of permissions) {
    if (perm.startsWith('GLOBAL_')) {
      categories['Global Read'].push(perm);
    } else if (perm.startsWith('PLATFORM_ROLE_')) {
      categories['Platform Roles'].push(perm);
    } else if (perm.startsWith('PLATFORM_')) {
      categories['Platform Operations'].push(perm);
    } else {
      categories['Client & Agency'].push(perm);
    }
  }

  // Remove empty categories
  Object.keys(categories).forEach((key) => {
    if (categories[key].length === 0) delete categories[key];
  });

  return categories;
}