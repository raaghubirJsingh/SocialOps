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

export interface StartOnboardingRequest {
  type: ClientType;
  name: string;
  description?: string;
  logoUrl?: string;
  directEmail: string;
  directPhone: string;
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

export interface StartOnboardingResponse {
  clientId: string;
  onboardingStatus: ClientOnboardingStatus;
  mobileVerificationRequired: boolean;
  mobileVerificationExpiresAt: string;
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
