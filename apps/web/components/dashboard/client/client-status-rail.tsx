'use client';

import Link from 'next/link';
import { CalendarDays, ChevronRight, UserRound } from 'lucide-react';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { ClientDto, ClientStatus } from '@/types/client';

const STATUS_LABELS: Readonly<Record<ClientStatus, string>> = Object.freeze({
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  SUSPENDED: 'Suspended',
});

const STATUS_CLASSES: Readonly<Record<ClientStatus, string>> = Object.freeze({
  ACTIVE: 'text-emerald-300',
  INACTIVE: 'text-amber-300',
  SUSPENDED: 'text-red-400',
});

interface ClientStatusRailProps {
  client: ClientDto | undefined;
  isPending: boolean;
}

/**
 * Right rail of the client overview: account status, client details and
 * quick actions. All values come from the real `GET /client/me` response;
 * while it loads the rail renders honest placeholders ('—'), never guesses.
 */
export function ClientStatusRail({ client, isPending }: ClientStatusRailProps) {
  const quickActions = [
    { href: '/client/profile', label: 'Edit profile', icon: UserRound },
    { href: '/client/social-accounts', label: 'Add social account', icon: Link2Icon },
    { href: '/client/content', label: 'View my content', icon: FileIcon },
  ];

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-200">
            Account status
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isPending ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : client ? (
            <>
              <p
                className={`text-xl font-semibold ${STATUS_CLASSES[client.status]}`}
              >
                {STATUS_LABELS[client.status]}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {client.onboardingStatus === 'ACTIVE'
                  ? 'Onboarding complete'
                  : 'Onboarding pending'}
              </p>
              {client.statusReason ? (
                <p className="mt-1 text-xs text-red-300">
                  {client.statusReason}
                </p>
              ) : null}
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-200">
            Client details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-400">Client type</dt>
              <dd className="text-slate-100">
                {client ? (client.type === 'BUSINESS' ? 'Business' : 'Individual') : '—'}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="flex items-center gap-1.5 text-slate-400">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                Member since
              </dt>
              <dd className="text-slate-100">
                {client ? new Date(client.createdAt).toLocaleDateString() : '—'}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-200">
            Quick actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1">
            {quickActions.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="flex items-center justify-between rounded-lg px-2 py-2 text-sm text-slate-300 transition-colors duration-200 hover:bg-white/[0.04] hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
                >
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-slate-400" aria-hidden="true" />
                    {label}
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-500" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}

function Link2Icon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    </svg>
  );
}