'use client';

import { RawDataRequestWizard } from '@/components/client/raw-data/raw-data-request-wizard';
import { SimpleRawDataRequest } from '@/components/client/raw-data/simple/simple-raw-data-request';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function RequestParams() {
  const params = useSearchParams();
  const clientId = params.get('clientId') ?? '';
  if (!clientId) {
    return <p className="p-6 text-sm text-slate-400">No client context. Go back to /client first.</p>;
  }
  // P1: the simplified, text-first experience is the default entry point.
  // The existing 8-step wizard remains fully reachable at ?advanced=1 and is
  // NOT deleted, rewritten or reduced by P1 (no legacy field is removed).
  if (params.get('advanced') === '1') {
    return <RawDataRequestWizard clientId={clientId} />;
  }
  return <SimpleRawDataRequest clientId={clientId} />;
}

export default function RawDataRequestRoute() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-slate-400">Loading…</p>}>
      <RequestParams />
    </Suspense>
  );
}
