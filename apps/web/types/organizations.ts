/**
 * Mirrors the response of GET /api/memberships/me.
 */
export type OrganizationRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
}

export interface MembershipDto {
  role: OrganizationRole;
  organization: OrganizationSummary;
}

export interface MembershipsResponseDto {
  userId: string;
  memberships: MembershipDto[];
}
