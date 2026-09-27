'use client';

import { useEffect, useState } from 'react';

import {
  isOAuthCallbackStatus,
  OAUTH_CALLBACK_MESSAGES,
  type OAuthCallbackStatus,
} from '@/types/social-account';

interface Notice {
  status: OAuthCallbackStatus;
  message: string;
}

const AUTO_DISMISS_MS = 8000;

/**
 * Listens for the backend's post-OAuth redirect.
 *
 * The public callback controller always answers with a 302 to
 * `${PUBLIC_WEB_URL}/?status=<marker>&platform=<platform>`, so this component
 * is mounted in the ROOT layout and catches the return on whichever page the
 * browser lands on.
 *
 * WHY `window.location.search` AND NOT `useSearchParams()`:
 * `useSearchParams` forces the surrounding route out of static rendering and
 * requires a Suspense boundary. The marketing landing page is currently
 * prerendered as static content, and a status query that exists only after a
 * redirect must not de-optimise the whole app. Reading the URL inside an
 * effect is client-only, leaves the static build intact, and still runs
 * before the user can interact.
 *
 * The markers are deliberately coarse and are matched against a fixed allowlist,
 * so an attacker-crafted `?status=` value can never inject arbitrary text or
 * component content.
 */
export function OAuthCallbackListener() {
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    // The URL is an EXTERNAL system, so it is read after mount rather than
    // during render: `window` does not exist during SSR, and reading it in a
    // lazy state initialiser would produce a hydration mismatch (the server
    // has no query string to see). The read is deferred by a tick so this
    // synchronises with the external system instead of cascading a render
    // during hydration.
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const rawStatus = params.get('status');
      if (!isOAuthCallbackStatus(rawStatus)) return;

      setNotice({
        status: rawStatus,
        message: OAUTH_CALLBACK_MESSAGES[rawStatus],
      });

      // Strip the marker so a refresh does not re-show the same toast, and so
      // the URL stays clean and shareable.
      params.delete('status');
      params.delete('platform');
      const rest = params.toString();
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${rest ? `?${rest}` : ''}`,
      );
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  if (!notice) return null;

  const isError = notice.status !== 'connected';

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4"
    >
      <div
        className={`pointer-events-auto max-w-md rounded-lg border px-4 py-3 text-sm shadow-lg ${
          isError
            ? 'border-red-900/60 bg-red-950/90 text-red-200'
            : 'border-emerald-800/60 bg-emerald-950/90 text-emerald-100'
        }`}
      >
        {notice.message}
      </div>
    </div>
  );
}
