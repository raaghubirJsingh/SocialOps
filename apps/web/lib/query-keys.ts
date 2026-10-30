/**
 * Query-key factory (Client Operations V1 + centralized app keys).
 *
 * One place for every key so an invalidation cannot silently miss a cache
 * entry. Following the existing convention, the ACTIVE organization id is part
 * of every agency-side key, so switching organizations never shows stale
 * cross-tenant data.
 */
export const queryKeys = {
  // Auth & user session
  session: () => ["session"] as const,
  me: () => ["me"] as const,
  memberships: (accessToken: string | null) =>
    ["memberships", "me", accessToken ? "auth" : "anon"] as const,

  // Social accounts (Meta, X, LinkedIn integrations)
  socialAccounts: {
    all: ["social-accounts"] as const,
    lists: () => ["social-accounts", "list"] as const,
    list: (
      scope: "agency" | "mine",
      organizationId: string | null,
      clientId: string,
    ) => ["social-accounts", "list", scope, organizationId, clientId] as const,
  },

  // Content & post scheduling
  contentList: (
    scope: "agency" | "mine",
    organizationId: string | null,
    clientId: string,
    status: string,
  ) => ["content", "list", scope, organizationId, clientId, status] as const,

  contentDetail: (
    scope: "agency" | "mine",
    organizationId: string | null,
    clientId: string,
    contentId: string,
  ) => ["content", "detail", scope, organizationId, clientId, contentId] as const,

  contentRevisions: (
    scope: "agency" | "mine",
    clientId: string,
    contentId: string,
  ) => ["content", "revisions", scope, clientId, contentId] as const,

  contentStatusEvents: (
    scope: "agency" | "mine",
    clientId: string,
    contentId: string,
  ) => ["content", "events", scope, clientId, contentId] as const,

  contentCalendar: (
    scope: "agency" | "mine",
    organizationId: string | null,
    clientId: string,
    startDate: string,
    endDate: string,
  ) =>
    [
      "content",
      "calendar",
      scope,
      organizationId,
      clientId,
      startDate,
      endDate,
    ] as const,

  rawData: (
    scope: "agency" | "mine",
    organizationId: string | null,
    clientId: string,
  ) => ["raw-data", scope, organizationId, clientId] as const,

  contentRequests: (clientId: string) =>
    ["content-requests", "mine", clientId] as const,

  contentRequest: (clientId: string, requestId: string) =>
    ["content-requests", "mine", clientId, requestId] as const,

  // Content (nested factory for optimistic updates)
  content: {
    all: ["content"] as const,
    lists: () => ["content", "list"] as const,
    list: (
      scope: "agency" | "mine",
      organizationId: string | null,
      clientId: string,
      status: string,
    ) => ["content", "list", scope, organizationId, clientId, status] as const,
    details: () => ["content", "detail"] as const,
    detail: (
      scope: "agency" | "mine",
      organizationId: string | null,
      clientId: string,
      contentId: string,
    ) => ["content", "detail", scope, organizationId, clientId, contentId] as const,
  },

  // Analytics & metrics
  analytics: (
    scope: "agency" | "mine",
    organizationId: string | null,
    clientId: string,
    range: string,
  ) => ["analytics", scope, organizationId, clientId, range] as const,

  metrics: (
    scope: "agency" | "mine",
    organizationId: string | null,
    clientId: string,
    metric: string,
    range: string,
  ) => ["metrics", scope, organizationId, clientId, metric, range] as const,

  // Client management
  clients: (organizationId: string | null) =>
    ["clients", organizationId] as const,

  client: (clientId: string | null) => ["client", clientId] as const,

  clientOverview: (clientId: string) => ["client-overview", clientId] as const,

  clientRelationships: (clientId: string) =>
    ["client-relationships", clientId] as const,

  organizations: {
    aiMembers: (organizationId: string | null) =>
      ["organizations", "ai-members", organizationId] as const,
  },
} as const;
