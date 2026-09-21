'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useRouter } from 'next/navigation';
import type { RawDataDto } from '@/types/content';

interface Props {
  onCreateAnother: () => void;
  record?: RawDataDto;
}

export function SubmissionConfirmation({ onCreateAnother, record }: Props) {
  const router = useRouter();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Request submitted</CardTitle>
        <CardDescription>Your content request has been recorded.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-300">
          {record ? (
            <>
              Your intake record has been saved.
              <br />
              <span className="font-mono text-xs text-slate-400">
                ID: {record.id} Â· captured {new Date(record.capturedAt).toLocaleString()}
              </span>
            </>
          ) : (
            'Your content request has been recorded.'
          )}
        </p>
        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={() => router.push('/client/content')}>
            Go to dashboard
          </Button>
          <Button type="button" variant="secondary" onClick={onCreateAnother}>
            Create another
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
