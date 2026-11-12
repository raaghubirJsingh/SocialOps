'use client';

import { useState, useCallback } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { z } from 'zod';
import { UserMinus, Shield, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Dialog } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';

import { revokePlatformAdmin } from '@/lib/super-admin-api';
import type { RevokePlatformAdminRequest } from '@/lib/super-admin-api';

const revokeSchema = z.object({
  userId: z.string().uuid('Invalid user ID format'),
  confirmName: z.string().min(1, 'You must type the user\'s name to confirm'),
});

export type RevokeAdminFormValues = z.infer<typeof revokeSchema>;

const revokeResolver: Resolver<RevokeAdminFormValues> = async (raw) => {
  const result = revokeSchema.safeParse(raw);
  if (result.success) {
    return { values: result.data, errors: {} };
  }
  const errors: Record<string, { type: string; message: string }> = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0]?.toString();
    if (!key) continue;
    if (errors[key]) continue;
    errors[key] = { type: 'validation', message: issue.message };
  }
  return { values: {} as Record<string, never>, errors };
};

interface RevokeAdminDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  admin: {
    id: string;
    email: string;
    fullName: string | null;
  } | null;
}

export function RevokeAdminDialog({
  open,
  onClose,
  onSuccess,
  admin,
}: RevokeAdminDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RevokeAdminFormValues>({
    resolver: revokeResolver,
    mode: 'onBlur',
    defaultValues: {
      userId: admin?.id ?? '',
      confirmName: '',
    },
  });

  const adminDisplayName = admin?.fullName ?? admin?.email ?? 'the user';

  const onSubmit = handleSubmit(async (values: RevokeAdminFormValues) => {
    // Verify confirmation name matches
    if (values.confirmName.toLowerCase().trim() !== adminDisplayName.toLowerCase().trim()) {
      setSubmitError(`Confirmation name does not match "${adminDisplayName}"`);
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const request: RevokePlatformAdminRequest = {
        userId: values.userId,
      };
      await revokePlatformAdmin(request);
      setSubmitSuccess(true);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1000);
    } catch (err) {
      if (err instanceof Error) {
        setSubmitError(err.message);
      } else {
        setSubmitError('Failed to revoke platform admin. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  });

  if (submitSuccess) {
    return (
      <Dialog
        open={open}
        title="Platform Admin Revoked"
        description="The user's platform administrator privileges have been revoked."
        onClose={onClose}
        dismissible={false}
        footer={
          <Button variant="default" onClick={onClose}>
            Done
          </Button>
        }
      >
        <div className="flex flex-col items-center text-center py-8">
          <CheckCircle2 className="h-12 w-12 text-emerald-400" />
          <p className="mt-4 text-slate-200">
            Platform admin privileges have been revoked for {adminDisplayName}.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            All refresh tokens for the user have been invalidated.
          </p>
        </div>
      </Dialog>
    );
  }

  if (!admin) {
    return (
      <Dialog
        open={open}
        title="Revoke Platform Admin"
        description="No admin selected."
        onClose={onClose}
        dismissible={!isSubmitting}
      >
        <p className="text-red-400 text-sm">No admin selected for revocation.</p>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      title="Revoke Platform Admin"
      description={`This will permanently remove platform administrator privileges from ${adminDisplayName}. This action cannot be undone.`}
      onClose={onClose}
      dismissible={!isSubmitting}
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            type="submit"
            form="revoke-admin-form"
            disabled={isSubmitting}
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Revoke Admin'}
          </Button>
        </div>
      }
    >
      <form id="revoke-admin-form" onSubmit={onSubmit} className="space-y-5" noValidate>
        {submitError && (
          <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-300">
            {submitError}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="confirmName">
            Type the user&apos;s name to confirm
          </Label>
          <input
            id="confirmName"
            type="text"
            placeholder={adminDisplayName}
            disabled={isSubmitting}
            className="w-full h-10 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 transition-colors duration-200 hover:border-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
            {...register('confirmName')}
          />
          {errors.confirmName && (
            <p className="text-xs text-red-400">{errors.confirmName.message}</p>
          )}
          <p className="text-xs text-slate-500">
            Must exactly match: <span className="font-mono text-slate-300">&quot;{adminDisplayName}&quot;</span>
          </p>
        </div>

        <Separator />

        <div className="flex items-start gap-3 text-sm text-slate-400">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5 text-amber-400" />
          <div>
            <p className="font-medium text-slate-300">This action will:</p>
            <ul className="mt-2 space-y-1 list-disc list-inside text-xs">
              <li>Remove all platform permissions</li>
              <li>Invalidate all active sessions (refresh tokens)</li>
              <li>Record an audit event</li>
            </ul>
            <p className="mt-2 text-xs text-slate-500">
              The user will need to be granted admin again to regain access.
            </p>
          </div>
        </div>

        <input type="hidden" {...register('userId')} />
      </form>
    </Dialog>
  );
}