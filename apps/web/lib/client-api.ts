/**
 * Client V1 API client.
 *
 * Mirrors the backend Client V1 endpoints at apps/api/src/clients.
 */

import { ApiError, apiFetch } from './api';
import type {
  ClientDto,
  ClientEventDto,
  StartOnboardingRequest,
  StartOnboardingResponse,
  ActivateOnboardingRequest,
  UpdateClientFieldRequest,
  FieldChangeResponse,
  VerifyFieldChangeRequest,
  VerifyFieldChangeResponse,
  InvitationResolution,
  AcceptInvitationResponse,
  ManagementRequestDto,
  AcceptManagementRequestResponse,
  CreateClientRequest,
  CreateClientResponse,
} from '@/types/client';

export const clientApi = {
  /**
   * Agency-side: list the Clients managed by the ACTIVE organization.
   *
   * GET /api/clients is organization-scoped on the backend: the global
   * OrganizationMembershipGuard verifies the `X-Organization-Id` header
   * (attached automatically by apiFetch from the ActiveOrganizationProvider
   * registry) against the caller's membership, and the response contains
   * ONLY Clients with an ACTIVE ClientAgencyRelationship to that
   * organization. Requires an active organization - never call without one.
   */
  listClients: (): Promise<ClientDto[]> => apiFetch<ClientDto[]>('/clients'),

  /**
   * Agency-side: create an unbound, PENDING Client for the ACTIVE
   * organization. Backend authorization: organization role OWNER or ADMIN
   * (RoleGuard + @RequireMinimumRole('ADMIN')) - the UI gate on this
   * action is a convenience only, the server remains authoritative.
   */
  createClient: (data: CreateClientRequest): Promise<CreateClientResponse> =>
    apiFetch<CreateClientResponse>('/clients', {
      method: 'POST',
      body: data,
    }),

  /**
   * Agency-side: fetch ONE client. The backend scopes this to the ACTIVE
   * organization (verified X-Organization-Id header + ACTIVE
   * ClientAgencyRelationship) and answers a uniform 404 'Client not found'
   * for anything outside it — no cross-agency leakage, no existence hint.
   * Requires an active organization — never call without one.
   */
  getClient: (clientId: string): Promise<ClientDto> =>
    apiFetch<ClientDto>(`/clients/${clientId}`),

  /**
   * Agency-side audit history for one client: only events recorded at or
   * after this organization's relationship started (max 200, newest first).
   */
  getClientHistory: (clientId: string): Promise<ClientEventDto[]> =>
    apiFetch<ClientEventDto[]>(`/clients/${clientId}/history`),

  /**
   * Public: resolve an invitation token.
   * No authentication required.
   */
  resolveInvitation: (token: string): Promise<InvitationResolution> =>
    apiFetch<InvitationResolution>(`/invitations/${token}`),

  /**
   * Accept an invitation. JWT required.
   */
  acceptInvitation: (token: string): Promise<AcceptInvitationResponse> =>
    apiFetch<AcceptInvitationResponse>(`/invitations/${token}/accept`, {
      method: 'POST',
    }),

  /**
   * Start self-registration onboarding AND perform 1-Click activation.
   * JWT required.
   *
   * This is the endpoint the client welcome T&C gate calls. Pass an empty
   * object: the backend derives name, email, phone and persona from the
   * authenticated, already-verified User record and returns an ACTIVE
   * Client with no mobile OTP. The optional fields are only consumed by
   * the legacy fallback for accounts that predate Registration Phase v1.0
   * (in which case `mobileVerificationRequired` comes back true and a
   * code must be submitted to `activateOnboarding`).
   */
  startOnboarding: (
    data: StartOnboardingRequest = {},
  ): Promise<StartOnboardingResponse> =>
    apiFetch<StartOnboardingResponse>('/onboarding/start', {
      method: 'POST',
      body: data,
    }),

  /**
   * Consume a mobile verification token to complete activation.
   * JWT required.
   *
   * NOT the 1-Click path: this endpoint requires a `token`, so it cannot
   * be used by the welcome T&C gate. It serves the legacy fallback and the
   * invitation flow, both of which still require their mobile token.
   */
  activateOnboarding: (
    data: ActivateOnboardingRequest,
  ): Promise<ClientDto> =>
    apiFetch<ClientDto>('/onboarding/activate', {
      method: 'POST',
      body: data,
    }),

  /**
   * Get current client profile. JWT + X-Client-Id required.
   */
  getMyClient: (clientId: string): Promise<ClientDto> =>
    apiFetch<ClientDto>('/client/me', {
      headers: { 'X-Client-Id': clientId },
    }),

  /**
   * Client-side audit history (GET /api/client/me/history): the Client
   * sees its OWN full event trail (insert-only, newest first). Requires
   * JWT + X-Client-Id; the backend re-verifies the binding per request.
   */
  getMyHistory: (clientId: string): Promise<ClientEventDto[]> =>
    apiFetch<ClientEventDto[]>('/client/me/history', {
      headers: { 'X-Client-Id': clientId },
    }),

  /**
   * Update a client field. JWT + X-Client-Id required.
   */
  updateField: (
    clientId: string,
    data: UpdateClientFieldRequest,
  ): Promise<FieldChangeResponse> =>
    apiFetch<FieldChangeResponse>('/client/me', {
      method: 'PATCH',
      body: data,
      headers: { 'X-Client-Id': clientId },
    }),

  /**
   * Verify a field change. JWT + X-Client-Id required.
   */
  verifyFieldChange: (
    clientId: string,
    changeId: string,
    data: VerifyFieldChangeRequest,
  ): Promise<VerifyFieldChangeResponse> =>
    apiFetch<VerifyFieldChangeResponse>(
      `/client/me/field-changes/${changeId}/verify`,
      {
        method: 'POST',
        body: data,
        headers: { 'X-Client-Id': clientId },
      },
    ),

  /**
   * Get pending management requests. JWT + X-Client-Id required.
   */
  getMyManagementRequests: (
    clientId: string,
  ): Promise<ManagementRequestDto[]> =>
    apiFetch<ManagementRequestDto[]>('/client/me/management-requests', {
      headers: { 'X-Client-Id': clientId },
    }),

  /**
   * Accept a management request. JWT + X-Client-Id required.
   */
  acceptManagementRequest: (
    clientId: string,
    requestId: string,
  ): Promise<AcceptManagementRequestResponse> =>
    apiFetch<AcceptManagementRequestResponse>(
      `/client/me/management-requests/${requestId}/accept`,
      {
        method: 'POST',
        headers: { 'X-Client-Id': clientId },
      },
    ),
};

export { ApiError };
