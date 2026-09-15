'use client';

import { useState } from 'react';
import { useForm, type FieldErrors, type Resolver } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api';
import { clientApi } from '@/lib/client-api';
import type { CreateClientRequest } from '@/types/client';

/**
 * Agency-side Client creation form (POST /api/clients).
 *
 * Validation mirrors the backend `createClientSchema`
 * (apps/api/src/clients/dto/create-client.dto.ts). Only the four REQUIRED
 * intake fields plus the optional description / website / notes are
 * collected here; every other optional backend field can be filled in
 * later through the existing PATCH /api/clients/:id field-change pipeline.
 *
 * React Hook Form is wired to Zod through a tiny local resolver adapter -
 * @hookform/resolvers is deliberately not a project dependency
 * (AGENTS.md: no new libraries without approval).
 *
 * The form never sends an organization id: the backend scopes creation to
 * the verified `X-Organization-Id` header attached by apiFetch.
 */

const createClientSchema = z.object({
  type: z.enum(['INDIVIDUAL', 'BUSINESS']),
  name: z
    .string()
    .trim()
    .min(1, 'Client name is required.')
    .max(200, 'Name must be 200 characters or fewer.'),
  directEmail: z
    .string()
    .trim()
    .min(1, 'Direct email is required.')
    .email('Enter a valid email address.')
    .max(200, 'Email must be 200 characters or fewer.'),
  directPhone: z
    .string()
    .trim()
    .min(5, 'Enter a valid phone number.')
    .max(50, 'Phone must be 50 characters or fewer.'),
  description: z
    .string()
    .trim()
    .max(2000, 'Description must be 2000 characters or fewer.')
    .optional(),
  website: z
    .string()
    .trim()
    .max(300, 'Website must be 300 characters or fewer.')
    .optional(),
  notes: z
    .string()
    .trim()
    .max(5000, 'Notes must be 5000 characters or fewer.')
    .optional(),
});

type CreateClientFormValues = z.infer<typeof createClientSchema>;

const formResolver: Resolver<CreateClientFormValues> = async (values) => {
  const parsed = createClientSchema.safeParse(values);
  if (parsed.success) {
    return { values: parsed.data, errors: {} };
  }

  const errors: FieldErrors<CreateClientFormValues> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string') {
      const field = key as keyof CreateClientFormValues;
      if (!errors[field]) {
        errors[field] = { type: issue.code, message: issue.message };
      }
    }
  }
  return { values: {}, errors };
};

const SELECT_CLASSES =
  'flex h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50';

interface CreateClientFormProps {
  /** Called after the backend accepted the creation (HTTP 201). */
  onCreated: () => void;
  onCancel: () => void;
}

export function CreateClientForm({ onCreated, onCancel }: CreateClientFormProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateClientFormValues>({
    resolver: formResolver,
    defaultValues: {
      type: 'INDIVIDUAL',
      name: '',
      directEmail: '',
      directPhone: '',
      description: '',
      website: '',
      notes: '',
    },
  });

  const submit = handleSubmit(async (values) => {
    setServerError(null);

    // Send only non-empty optional fields so the backend stores NULLs,
    // matching the nullish optional contract of createClientSchema.
    const payload: CreateClientRequest = {
      type: values.type,
      name: values.name,
      directEmail: values.directEmail,
      directPhone: values.directPhone,
    };
    if (values.description && values.description.length > 0) {
      payload.description = values.description;
    }
    if (values.website && values.website.length > 0) {
      payload.website = values.website;
    }
    if (values.notes && values.notes.length > 0) {
      payload.notes = values.notes;
    }

    try {
      await clientApi.createClient(payload);
      onCreated();
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setServerError(
          'Your organization role does not allow creating clients (OWNER or ADMIN required).',
        );
        return;
      }
      if (err instanceof ApiError && err.status === 400) {
        setServerError(
          'The submitted details were rejected by the server. Review the form and try again.',
        );
        return;
      }
      setServerError('Unable to create the client. Please try again.');
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>New client</CardTitle>
        <CardDescription>
          The client starts as PENDING and unbound. After creation, invite the
          client account so its owner can complete onboarding. The creating
          organization becomes the managing Agency; you never become the
          client&apos;s owner.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="grid gap-2">
            <Label htmlFor="client-type" className="text-sm font-medium text-slate-300">
              Client type
            </Label>
            <select
              id="client-type"
              className={SELECT_CLASSES}
              aria-invalid={Boolean(errors.type)}
              {...register('type')}
            >
              <option value="INDIVIDUAL">Individual</option>
              <option value="BUSINESS">Business</option>
            </select>
            {errors.type && <p className="text-xs text-red-400">{errors.type.message}</p>}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="client-name" className="text-sm font-medium text-slate-300">
              Client name
            </Label>
            <Input
              id="client-name"
              type="text"
              placeholder="e.g. Northwind Cafe"
              aria-invalid={Boolean(errors.name)}
              {...register('name')}
            />
            {errors.name && <p className="text-xs text-red-400">{errors.name.message}</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="client-email" className="text-sm font-medium text-slate-300">
                Direct email
              </Label>
              <Input
                id="client-email"
                type="email"
                placeholder="owner@example.com"
                aria-invalid={Boolean(errors.directEmail)}
                {...register('directEmail')}
              />
              {errors.directEmail && (
                <p className="text-xs text-red-400">{errors.directEmail.message}</p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="client-phone" className="text-sm font-medium text-slate-300">
                Direct phone
              </Label>
              <Input
                id="client-phone"
                type="tel"
                placeholder="e.g. +91 98765 43210"
                aria-invalid={Boolean(errors.directPhone)}
                {...register('directPhone')}
              />
              {errors.directPhone && (
                <p className="text-xs text-red-400">{errors.directPhone.message}</p>
              )}
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="client-description" className="text-sm font-medium text-slate-300">
              Description <span className="text-slate-500">(optional)</span>
            </Label>
            <Input
              id="client-description"
              type="text"
              aria-invalid={Boolean(errors.description)}
              {...register('description')}
            />
            {errors.description && (
              <p className="text-xs text-red-400">{errors.description.message}</p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="client-website" className="text-sm font-medium text-slate-300">
              Website <span className="text-slate-500">(optional)</span>
            </Label>
            <Input
              id="client-website"
              type="text"
              aria-invalid={Boolean(errors.website)}
              {...register('website')}
            />
            {errors.website && <p className="text-xs text-red-400">{errors.website.message}</p>}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="client-notes" className="text-sm font-medium text-slate-300">
              Internal notes <span className="text-slate-500">(optional)</span>
            </Label>
            <textarea
              id="client-notes"
              rows={3}
              className={`${SELECT_CLASSES} min-h-20 py-2`}
              aria-invalid={Boolean(errors.notes)}
              {...register('notes')}
            />
            {errors.notes && <p className="text-xs text-red-400">{errors.notes.message}</p>}
          </div>

          {serverError && (
            <div
              role="alert"
              className="rounded-md border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300"
            >
              {serverError}
            </div>
          )}

          <div className="flex gap-3">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating…' : 'Create client'}
            </Button>
            <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

