/**
 * Client V1 API client.
 *
 * Mirrors the backend Client V1 endpoints at apps/api/src/clients.
 */

import { ApiError, apiFetch } from './api';
import type {
  ClientDto,
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
} from '@/types/client';

export const clientApi = {
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
   * Start self-registration onboarding. JWT required.
   */
  startOnboarding: (
    data: StartOnboardingRequest,
  ): Promise<StartOnboardingResponse> =>
    apiFetch<StartOnboardingResponse>('/onboarding/start', {
      method: 'POST',
      body: data,
    }),

  /**
   * Activate onboarding with mobile verification token. JWT required.
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
