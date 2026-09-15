/**
 * Mirrors the response of GET /api/memberships/me.
 */
export type OrganizationRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  /**
   * Server-side tenant state (Organization.isActive). The backend
   * already filters memberships of deactivated organizations out of
   * GET /api/memberships/me; this field mirrors the contract so the
   * UI can render or assert it without assuming local state
   * (AGENTS.md §7: server-side authorization is authoritative).
   */
  isActive: boolean;
}

export interface MembershipDto {
  role: OrganizationRole;
  organization: OrganizationSummary;
}

export interface MembershipsResponseDto {
  userId: string;
  memberships: MembershipDto[];
}
