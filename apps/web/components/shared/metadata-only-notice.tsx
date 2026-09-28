import { cn } from '@/lib/cn';

/**
 * Metadata-only notice for Social Accounts (Client Operations V1).
 *
 * The metadata half of the original descope still holds and is the point of
 * this notice: SocialAccount rows are DECLARED by the client/agency and are
 * NOT verified against the platform, and no password, access token or
 * refresh token is ever collected, stored, or displayed here.
 *
 * It previously also claimed "Connecting an account (OAuth) is not part of
 * this phase", citing Decision 008. That sentence is STALE: Decision 013
 * approved the Social Account OAuth handshake as an explicit change to
 * previously deferred scope, and the connect buttons are rendered on the
 * very pages that show this notice. Leaving it produced a page that denied
 * OAuth existed while offering three OAuth buttons. The statement is
 * removed; the metadata-only and token-handling disclosures are preserved.
 */
export function MetadataOnlyNotice({ className }: { className?: string }) {
  return (
    <p
      role="note"
      className={cn(
        'rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-xs leading-relaxed text-slate-400',
        className,
      )}
    >
      <span className="font-medium text-slate-300">Recorded metadata only.</span>{' '}
      These details are declared by the client or agency and are{' '}
      <span className="text-slate-300">not verified against the platform</span>.
      Authorising a platform is handled separately from this record, and no
      password, access token, or refresh token is ever collected, stored, or
      shown here.
    </p>
  );
}