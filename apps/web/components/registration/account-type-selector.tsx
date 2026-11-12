'use client';

import Link from 'next/link';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

/**
 * Account-type selector for the main /register page.
 *
 * Four approved account options:
 *   - Client             -> /register/client
 *   - Service Provider   -> /register/agency
 *   - Employee/Freelancer -> /register/employee-freelancer
 *   - News Organisation  -> /news-organisation/register
 *
 * This is a pure navigation component: no conversational discovery UI,
 * no chat bubbles, no wizard stages. Each card is a link to a
 * conventional registration form.
 */
export function AccountTypeSelector() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <OptionCard
        href="/register/client"
        title="Client"
        description="Manage your own social media accounts"
        badge="Individual / Business"
      />
      <OptionCard
        href="/register/agency"
        title="Service Provider / Agency"
        description="Manage accounts for your clients"
        badge="Organization"
      />
      <OptionCard
        href="/register/employee-freelancer"
        title="Employee / Freelancer"
        description="Work with SocialOps as staff or contractor"
        badge="Choose below"
      />
      <OptionCard
        href="/news-organisation/register"
        title="News Organisation"
        description="Register a news organisation"
        badge="Organization"
      />
    </div>
  );
}

interface OptionCardProps {
  href: string;
  title: string;
  description: string;
  badge: string;
}

function OptionCard({ href, title, description, badge }: OptionCardProps) {
  return (
    <Link
      href={href}
      className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
    >
      <Card
        surface="panel"
        className="h-full rounded-xl border-slate-700/60 transition-colors duration-200 hover:border-blue-500/60 hover:bg-slate-800/40 group-focus-visible:ring-2 group-focus-visible:ring-blue-400/60"
      >
        <CardHeader className="space-y-1.5 pb-2">
          <CardTitle className="text-base font-semibold text-slate-50">
            {title}
          </CardTitle>
          <CardDescription className="text-xs leading-relaxed text-slate-300">
            {description}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-300">
            {badge}
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}