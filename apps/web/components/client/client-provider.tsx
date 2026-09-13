'use client';

import { createContext, useContext, useState, useMemo, type ReactNode } from 'react';
import type { ClientDto } from '@/types/client';

interface ClientContextValue {
  client: ClientDto | null;
  setClient: (client: ClientDto | null) => void;
}

const ClientContext = createContext<ClientContextValue | null>(null);

/**
 * Client context provider for Client V1 routes.
 * Manages the current client state across the client dashboard.
 */
export function ClientProvider({ children }: { children: ReactNode }) {
  const [client, setClient] = useState<ClientDto | null>(null);

  const value = useMemo<ClientContextValue>(
    () => ({ client, setClient }),
    [client],
  );

  return (
    <ClientContext.Provider value={value}>{children}</ClientContext.Provider>
  );
}

/**
 * Access the client context.
 * Must be used within a ClientProvider.
 */
export function useClientContext(): ClientContextValue {
  const ctx = useContext(ClientContext);
  if (!ctx) {
    throw new Error('useClientContext must be used within a ClientProvider');
  }
  return ctx;
}
