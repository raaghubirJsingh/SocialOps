'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';

import { useSession } from '@/hooks/use-session';

// Mount store for hydration safety. The server snapshot is always
// `false`; the client snapshot starts `false` (matching the server's
// first render) and flips to `true` once the component subscribes
// post-hydration. Using an external store keeps the mount gate out of
// `useState`+`useEffect`, which the React Compiler lint rule forbids.
const mountListeners = new Set<() => void>();
let clientMounted = false;

function subscribeToMount(onChange: () => void): () => void {
  mountListeners.add(onChange);
  if (!clientMounted) {
    clientMounted = true;
    // Notify asynchronously so the initial `false` render commits
    // first (identical to the server render) before re-rendering.
    queueMicrotask(() => {
      mountListeners.forEach((listener) => listener());
    });
  }
  return () => {
    mountListeners.delete(onChange);
  };
}

function getMountSnapshot(): boolean {
  return clientMounted;
}

function getMountServerSnapshot(): boolean {
  return false;
}

/**
 * Frontend auth guard for the (app) route group.
 *
 * Unauthenticated access to any (app) route (/dashboard) is redirected
 * to the public home page "/" (approved routing matrix — NOT to
 * /login).
 *
 * Hydration safety: the session is read from `localStorage`, which is
 * unavailable during SSR, so the server always renders the
 * unauthenticated state (`null`). The guard therefore defers the
 * authenticated branch until after mount, keeping the server render
 * and the client's first render identical and resolving the session
 * post-hydration.
 *
 * This is a UX convenience, not a security boundary: the backend
 * remains the authoritative security boundary and enforces
 * authentication + RBAC + organization scoping on every API call.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useSession();
  // Mount gate: `false` during SSR and the client's first render, so
  // both emit the same `null` placeholder. The external store flips to
  // `true` after subscription (client only, post-hydration), after
  // which the real session state is rendered. This preserves redirect
  // behavior while eliminating the server/client first-render
  // divergence for stored sessions.
  const hasMounted = useSyncExternalStore(
    subscribeToMount,
    getMountSnapshot,
    getMountServerSnapshot,
  );

  useEffect(() => {
    if (hasMounted && !isLoading && !isAuthenticated) {
      router.replace('/');
    }
  }, [hasMounted, isAuthenticated, isLoading, router]);

  if (!hasMounted || !isAuthenticated) {
    // Render nothing while the guard redirects; avoids a flash of
    // authenticated UI.
    return null;
  }

  return <>{children}</>;
}