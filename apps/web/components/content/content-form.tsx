'use client';

import { useForm, type FieldErrors, type Resolver } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { editClearsConfirmation } from '@/lib/content-status';
import type { ContentDto } from '@/types/content';

/**
 * Content create/edit form.
 *
 * `status` is never accepted here: the server owns the status machine, every
 * item is born DRAFT, and only the transition endpoint may move it.
 *
 * Editing an APPROVED item is allowed by the server but has a consequence the
 * UI must make explicit (approved rule D7): it appends a new revision, returns
 * the item to DRAFT, and CLEARS the final confirmation. The warning is shown
 * before submission whenever that applies.
 */
const formSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'A title is required.')
    .max(300, 'Title must be 300 characters or fewer.'),
  body: z
    .string()
    .trim()
    .min(1, 'A body is required.')
    .max(50_000, 'Body must be 50000 characters or fewer.'),
});

type FormValues = z.infer<typeof formSchema>;

const resolver: Resolver<FormValues> = async (values) => {
  const parsed = formSchema.safeParse(values);
  if (parsed.success) return { values: parsed.data, errors: {} };

  const errors: FieldErrors<FormValues> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string') {
      const field = key as keyof FormValues;
      if (!errors[field]) {
        errors[field] = { type: issue.code, message: issue.message };
      }
    }
  }
  return { values: {}, errors };
};

interface ContentFormProps {
  mode: 'create' | 'edit';
  /** The item being edited (edit mode only). */
  initial?: ContentDto;
  onSubmit: (values: { title: string; body: string }) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
  error: string | null;
}

export function ContentForm({
  mode,
  initial,
  onSubmit,
  onCancel,
  isSubmitting,
  error,
}: ContentFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver,
    defaultValues: {
      title: initial?.title ?? '',
      body: initial?.body ?? '',
    },
  });

  const willClearConfirmation =
    mode === 'edit' && initial ? editClearsConfirmation(initial.status) : false;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid gap-2">
        <Label htmlFor="content-title" className="text-sm font-medium text-slate-300">
          Title
        </Label>
        <Input
          id="content-title"
          disabled={isSubmitting}
          {...register('title')}
        />
        {errors.title && <p className="text-xs text-red-400">{errors.title.message}</p>}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="content-body" className="text-sm font-medium text-slate-300">
          Body
        </Label>
        <Textarea
          id="content-body"
          rows={10}
          disabled={isSubmitting}
          {...register('body')}
        />
        {errors.body && <p className="text-xs text-red-400">{errors.body.message}</p>}
      </div>

      {willClearConfirmation && (
        <p
          role="note"
          className="rounded-md border border-amber-900/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-200"
        >
          This item already carries a final confirmation. Saving will append a new
          revision, return it to <span className="font-medium">Draft</span>, and clear
          that confirmation — the client owner must confirm again.
        </p>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-md border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300"
        >
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? 'Saving…'
            : mode === 'create'
              ? 'Create draft'
              : 'Save changes'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}