import type { ReactNode } from 'react';
import { ClientProvider } from '@/components/client/client-provider';

/**
 * Client route group layout.
 * Wraps all client routes with the ClientProvider.
 */
export default function ClientLayout({ children }: { children: ReactNode }) {
  return <ClientProvider>{children}</ClientProvider>;
}
