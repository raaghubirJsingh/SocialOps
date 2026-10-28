'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useRouter } from 'next/navigation';
import type { RawDataDto } from '@/types/content';

interface Props {
  onCreateAnother: () => void;
  record?: RawDataDto;
  clientId: string;
}

export function SubmissionConfirmation({ onCreateAnother, record, clientId }: Props) {
  const router = useRouter();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Request submitted</CardTitle>
        <CardDescription>
          Your content request has been sent to your agency.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-300">
          {record ? (
            <>
              Your content request has been sent to your agency.
              <br />
              <span className="font-mono text-xs text-slate-400">
                Sent {new Date(record.capturedAt).toLocaleString()}
              </span>
            </>
          ) : (
            'Your content request has been sent to your agency.'
          )}
        </p>
        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={() => router.push(`/client/content?clientId=${clientId}`)}>
            View my requests
          </Button>
          <Button type="button" variant="secondary" onClick={onCreateAnother}>
            Create another
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
