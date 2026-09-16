/**
 * Query-key factory (Client Operations V1).
 *
 * One place for every key so an invalidation cannot silently miss a cache
 * entry. Following the existing convention, the ACTIVE organization id is part
 * of every agency-side key, so switching organizations never shows stale
 * cross-tenant data.
 */
export const queryKeys = {
  socialAccounts: (
    scope: 'agency' | 'mine',
    organizationId: string | null,
    clientId: string,
  ) => ['social-accounts', scope, organizationId, clientId] as const,

  contentList: (
    scope: 'agency' | 'mine',
    organizationId: string | null,
    clientId: string,
    status: string,
  ) => ['content', 'list', scope, organizationId, clientId, status] as const,

  contentDetail: (
    scope: 'agency' | 'mine',
    organizationId: string | null,
    clientId: string,
    contentId: string,
  ) => ['content', 'detail', scope, organizationId, clientId, contentId] as const,

  contentRevisions: (
    scope: 'agency' | 'mine',
    clientId: string,
    contentId: string,
  ) => ['content', 'revisions', scope, clientId, contentId] as const,

  contentStatusEvents: (
    scope: 'agency' | 'mine',
    clientId: string,
    contentId: string,
  ) => ['content', 'events', scope, clientId, contentId] as const,

  rawData: (
    scope: 'agency' | 'mine',
    organizationId: string | null,
    clientId: string,
  ) => ['raw-data', scope, organizationId, clientId] as const,
} as const;