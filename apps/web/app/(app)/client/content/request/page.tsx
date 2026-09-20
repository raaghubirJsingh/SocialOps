import { RawDataRequestWizard } from '@/components/client/raw-data/raw-data-request-wizard';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function RequestParams() {
  const params = useSearchParams();
  const clientId = params.get('clientId') ?? '';
  if (!clientId) {
    return <p className="p-6 text-sm text-slate-400">No client context. Go back to /client first.</p>;
  }
  return <RawDataRequestWizard clientId={clientId} />;
}

export default function RawDataRequestRoute() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-slate-400">Loading…</p>}>
      <RequestParams />
    </Suspense>
  );
}
