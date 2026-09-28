/**
 * Client V1 shared types.
 *
 * Mirrors the backend Prisma model and DTOs at apps/api/src/clients.
 */

export type ClientType = 'INDIVIDUAL' | 'BUSINESS';
export type ClientStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
export type ClientOnboardingStatus = 'PENDING' | 'ACTIVE';
export type ClientField =
  | 'NAME'
  | 'DIRECT_EMAIL'
  | 'DIRECT_MOBILE'
  | 'PRIMARY_CONTACT_NAME'
  | 'PRIMARY_CONTACT_MOBILE'
  | 'WEBSITE'
  | 'ADDRESS'
  | 'DESCRIPTION'
  | 'INDUSTRY'
  | 'CLIENT_TYPE'
  | 'LOGO_AVATAR'
  | 'NOTES';

export interface ClientDto {
  id: string;
  ownerUserId: string | null;
  type: ClientType;
  name: string;
  description: string | null;
  logoUrl: string | null;
  directEmail: string;
  directPhone: string;
  primaryContactName: string | null;
  primaryContactPhone: string | null;
  website: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  industry: string | null;
  status: ClientStatus;
  statusReason: string | null;
  statusChangedAt: string | null;
  onboardingStatus: ClientOnboardingStatus;
  onboardingCompletedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type Industry =
  | 'Advertising & Marketing'
  | 'Automotive'
  | 'Beauty & Personal Care'
  | 'Education & Training'
  | 'Entertainment & Media'
  | 'Fashion & Apparel'
  | 'Finance & Insurance'
  | 'Food & Beverage'
  | 'Healthcare & Wellness'
  | 'Hospitality & Travel'
  | 'Manufacturing'
  | 'Legal & Professional Services'
  | 'Nonprofit & Community'
  | 'Real Estate & Construction'
  | 'Retail & E-commerce'
  | 'Sports & Fitness'
  | 'Technology & Software'
  | 'Transportation & Logistics'
  | 'Other';

/** Optional detail fields shared by both client-creation contracts. */
interface ClientOptionalDetails {
  description?: string;
  logoUrl?: string;
  primaryContactName?: string;
  primaryContactPhone?: string;
  website?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  industry?: Industry;
}

/**
 * Self-registration onboarding (POST /api/onboarding/start).
 *
 * 1-Click Activation: all four identity fields are OPTIONAL because the
 * normal path sends an empty body - the backend reads name, email, phone
 * and persona from the already-verified User record. They are only used by
 * the legacy mobile-OTP fallback for accounts that predate Registration
 * Phase v1.0 verification.
 */
export interface StartOnboardingRequest extends ClientOptionalDetails {
  type?: ClientType;
  name?: string;
  directEmail?: string;
  directPhone?: string;
}

/**
 * Mirrors the backend response of POST /api/onboarding/start.
 *
 * `mobileVerificationRequired` is FALSE for the 1-Click path, where the
 * Client is returned already ACTIVE in `client`. It is TRUE only on the
 * legacy fallback, where a verification code was issued and
 * `mobileVerificationExpiresAt` is set.
 */
export interface StartOnboardingResponse {
  clientId: string;
  onboardingStatus: ClientOnboardingStatus;
  mobileVerificationRequired: boolean;
  mobileVerificationExpiresAt: string | null;
  client: ClientDto | null;
}

/**
 * Agency-side Client creation (POST /api/clients).
 *
 * Mirrors the backend `createClientSchema`
 * (apps/api/src/clients/dto/create-client.dto.ts), which still REQUIRES
 * type/name/directEmail/directPhone (only the self-registration schema
 * relaxed those for 1-Click Activation) plus the Agency-only `notes` field.
 * The created Client is PENDING and UNBOUND —
 * the creating Agency user NEVER becomes the owner; the ACTIVE
 * organization (from the verified `X-Organization-Id` header) becomes the
 * managing Agency.
 */
export interface CreateClientRequest extends ClientOptionalDetails {
  type: ClientType;
  name: string;
  directEmail: string;
  directPhone: string;
  notes?: string;
}

/**
 * Mirrors the backend response of POST /api/clients
 * (ClientsController.create): the created Client plus a hint pointing at
 * the invitation endpoint for binding a Client account later.
 */
export interface CreateClientResponse {
  client: ClientDto;
  invitationHint: string;
}

/**
 * Mirrors the backend ClientEvent model (insert-only audit trail,
 * AGENTS.md §8). Returned by GET /api/clients/:id/history — scoped to the
 * ACTIVE organization's relationship (events from a previous Agency are
 * not exposed) and capped at 200 items server-side.
 */
export interface ClientEventDto {
  id: string;
  clientId: string;
  actorUserId: string | null;
  action: string;
  details: unknown;
  createdAt: string;
}

export interface ActivateOnboardingRequest {
  token: string;
}

export interface UpdateClientFieldRequest {
  field: ClientField;
  value: string | null;
  currentPassword?: string;
}

export interface FieldChangeResponse {
  status: 'APPLIED' | 'PENDING_VERIFICATION';
  field: ClientField;
  changeId?: string;
}

export interface VerifyFieldChangeRequest {
  token: string;
}

export interface VerifyFieldChangeResponse {
  status: 'verified';
}

export interface InvitationResolution {
  clientName: string;
  clientType: ClientType;
  email: string;
  expiresAt: string;
}

export interface AcceptInvitationResponse {
  clientId: string;
  mobileVerificationRequired: boolean;
  mobileVerificationExpiresAt: string;
}

export interface OrganizationSummary {
  id: string;
  name: string;
}

export interface ManagementRequestDto {
  id: string;
  clientId: string;
  organizationId: string;
  status: 'PENDING_INVITATION';
  initiatedBy: 'AGENCY';
  startedAt: string | null;
  terminatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  organization: OrganizationSummary;
}

export interface AcceptManagementRequestResponse {
  id: string;
  clientId: string;
  organizationId: string;
  status: 'ACTIVE';
  initiatedBy: string;
  startedAt: string;
  terminatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiErrorResponse {
  message: string;
  error: string;
  statusCode: number;
  code?: string;
  detail?: string;
  retryAt?: string;
}
