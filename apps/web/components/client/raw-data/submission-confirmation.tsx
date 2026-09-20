'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  onCreateAnother: () => void;
}

export function SubmissionConfirmation({ onCreateAnother }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Request submitted</CardTitle>
        <CardDescription>Your content request passed local validation.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-300">
          This preview build validates the request locally. The server submission will be wired in a later step.
        </p>
        <Button type="button" variant="secondary" onClick={onCreateAnother}>
          Create another
        </Button>
      </CardContent>
    </Card>
  );
}
