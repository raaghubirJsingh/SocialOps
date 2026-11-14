'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface RegistrationCard {
  href: string;
  icon: string;
  title: string;
  description: string;
  note?: string;
  disabled?: boolean;
}

const CARDS: RegistrationCard[] = [
  {
    href: '/register/client',
    icon: '👤',
    title: 'Client',
    description: 'Register as an Individual or Business client. Manage your own social media.',
  },
  {
    href: '/register/agency',
    icon: '🏢',
    title: 'Service Provider',
    description: 'Register as an Agency managing multiple clients. Team and workspace included.',
  },
  {
    href: '/register/employee-freelancer',
    icon: '💼',
    title: 'Employee / Freelancer',
    description: 'Employee registration works. Freelancer registration is not yet available.',
    note: 'Freelancer link (/freelancers/register) currently has no page.',
  },
  {
    href: '/news-organisation/register',
    icon: '📰',
    title: 'News Organisation',
    description: 'View registration requirements. Backend implementation is pending.',
    note: 'Backend registration not implemented.',
    disabled: true,
  },
];

export function RegistrationChoice() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {CARDS.map((card) => (
        <Link
          key={card.href}
          href={card.href}
          className={card.disabled ? 'pointer-events-none' : 'block'}
        >
          <Card
            className={`surface-panel transition-colors ${
              card.disabled ? 'opacity-60' : 'hover:border-blue-500/50'
            }`}
          >
            <CardHeader className="text-center">
              <div className="mx-auto mb-2 text-4xl">{card.icon}</div>
              <CardTitle className="text-lg">{card.title}</CardTitle>
              <CardDescription className="text-xs">{card.description}</CardDescription>
              {card.note && (
                <p className="text-[11px] text-amber-400 mt-1">{card.note}</p>
              )}
            </CardHeader>
          </Card>
        </Link>
      ))}
    </div>
  );
}