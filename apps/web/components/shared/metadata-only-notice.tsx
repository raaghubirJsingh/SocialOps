import { cn } from '@/lib/cn';

/**
 * Metadata-only notice for Social Accounts (Client Operations V1).
 *
 * Required by the approved descope (docs/APPROVED_DECISIONS.md Decision 008):
 * SocialAccount rows are DECLARED by the client/agency and are NOT verified
 * against the platform, and no OAuth connection exists in V1. This notice is
 * rendered on both the list and the form so the UI can never imply that an
 * account is "connected".
 */
export function MetadataOnlyNotice({ className }: { className?: string }) {
  return (
    <p
      role="note"
      className={cn(
        'rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs leading-relaxed text-slate-400',
        className,
      )}
    >
      <span className="font-medium text-slate-300">Recorded metadata only.</span>{' '}
      These details are declared by the client or agency and are{' '}
      <span className="text-slate-300">not verified against the platform</span>.
      Connecting an account (OAuth) is not part of this phase, so no password,
      access token, or refresh token is ever collected or stored here.
    </p>
  );
}