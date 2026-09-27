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
 * OAuth CONNECT lives here too (Decision 013), and follows the SAME two-scope
 * split as the metadata methods above. It is a navigation handshake, not a
 * credential exchange: the response is only an authorize URL that the browser
 * must follow with a full-page redirect. No token is ever returned, sent, or
 * read by the frontend - the backend completes the exchange on its public
 * callback and stores the result server-side.
 */
import { apiFetch } from './api';
import type {
  CreateSocialAccountRequest,
  OAuthConnectResponse,
  SocialAccountDto,
  SocialPlatform,
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

  /**
   * Agency connect start. NO tenant header is set here on purpose: apiFetch
   * attaches the verified `X-Organization-Id`, and the backend proves an
   * ACTIVE ClientAgencyRelationship plus the ADMIN role on every call.
   */
  startOAuthConnectForClient: (
    clientId: string,
    platform: SocialPlatform,
  ): Promise<OAuthConnectResponse> =>
    apiFetch<OAuthConnectResponse>(
      `/clients/${clientId}/social-accounts/${platform}/connect`,
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

  /**
   * Client self-service connect start. The tenant context is the EXPLICIT
   * `X-Client-Id` header (there is no organization context for a client owner);
   * the backend re-verifies it against the User -> Client binding and the
   * ACTIVE agency relationship on every call.
   */
  startOAuthConnectMine: (
    clientId: string,
    platform: SocialPlatform,
  ): Promise<OAuthConnectResponse> =>
    apiFetch<OAuthConnectResponse>(
      `/client/me/social-accounts/${platform}/connect`,
      { headers: { 'X-Client-Id': clientId } },
    ),
};