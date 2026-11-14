'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';

/**
 * News Organisation registration placeholder.
 *
 * This component is a read-only informational placeholder.
 * The backend registration endpoint has not been implemented.
 * Do not call registerNewsOrganisation() or submit any data.
 */
export function RegisterNewsOrganisationForm() {
  return (
    <Card className="surface-panel border-amber-800/50">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-amber-900/30 text-amber-400">
          <AlertCircle className="h-5 w-5" />
        </div>
        <CardTitle className="text-lg">News Organisation Registration</CardTitle>
        <CardDescription className="text-sm">
          Registration is not yet available. The backend implementation is pending.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-center text-sm text-slate-400">
        <p>This feature requires a separate backend development phase.</p>
        <p>No registration attempt will be made.</p>
      </CardContent>
    </Card>
  );
}