/**
 * Social Account API client (Client Operations V1) - METADATA ONLY.
 *
 * Mirrors apps/api/src/social-accounts. Two scopes, matching the backend's
 * authorization split:
 *   - agency methods (`…ForClient`) hit `/clients/:clientId/social-accounts`
 *     and send NO tenant header: apiFetch attaches the verified
 *     `X-Organization-Id` from the active-organization registry, and the
 *     backend proves an ACTIVE ClientAgencyRelationship on every call.
 *   - client methods (`…Mine`) hit `/client/me/social-accounts` and pass the
 *     `X-Client-Id` header explicitly, exactly like `lib/client-api.ts`. The
 *     backend re-verifies that header against the User -> Client binding.
 *
 * There is NO OAuth call here - no authorize/connect/callback/refresh/revoke
 * method exists, and there is no token parameter anywhere. Connection is
 * deferred to a separately approved phase.
 */
import { apiFetch } from './api';
import type {
  CreateSocialAccountRequest,
  SocialAccountDto,
  UpdateSocialAccountRequest,
} from '@/types/social-account';

export const socialAccountApi = {
  // ---- agency scope (organization context attached by apiFetch) ----
  listForClient: (clientId: string): Promise<SocialAccountDto[]> =>
    apiFetch<SocialAccountDto[]>(`/clients/${clientId}/social-accounts`),

  createForClient: (
    clientId: string,
    body: CreateSocialAccountRequest,
  ): Promise<SocialAccountDto> =>
    apiFetch<SocialAccountDto>(`/clients/${clientId}/social-accounts`, {
      method: 'POST',
      body,
    }),

  updateForClient: (
    clientId: string,
    socialAccountId: string,
    body: UpdateSocialAccountRequest,
  ): Promise<SocialAccountDto> =>
    apiFetch<SocialAccountDto>(
      `/clients/${clientId}/social-accounts/${socialAccountId}`,
      { method: 'PATCH', body },
    ),

  // ---- client self-service scope (owner binding re-verified server-side) ----
  listMine: (clientId: string): Promise<SocialAccountDto[]> =>
    apiFetch<SocialAccountDto[]>('/client/me/social-accounts', {
      headers: { 'X-Client-Id': clientId },
    }),

  createMine: (
    clientId: string,
    body: CreateSocialAccountRequest,
  ): Promise<SocialAccountDto> =>
    apiFetch<SocialAccountDto>('/client/me/social-accounts', {
      method: 'POST',
      body,
      headers: { 'X-Client-Id': clientId },
    }),

  updateMine: (
    clientId: string,
    socialAccountId: string,
    body: UpdateSocialAccountRequest,
  ): Promise<SocialAccountDto> =>
    apiFetch<SocialAccountDto>(`/client/me/social-accounts/${socialAccountId}`, {
      method: 'PATCH',
      body,
      headers: { 'X-Client-Id': clientId },
    }),
};