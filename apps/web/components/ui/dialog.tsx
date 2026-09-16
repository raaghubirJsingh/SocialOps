'use client';

import { useEffect, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';

interface DialogProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
}

/**
 * Minimal, dependency-free modal dialog.
 *
 * This project has no Radix dialog (and AGENTS.md forbids adding libraries
 * without approval), so this mirrors the existing overlay pattern used by
 * `components/client/field-change-modal.tsx` and adds the basics the new
 * destructive workflows need: `role="dialog"`, `aria-modal`, an Escape-key
 * close, a backdrop-click close, and a labelled title.
 *
 * Known limitation (documented deliberately): there is no focus TRAP. The
 * dialog is only used for short confirmations, and every action it hosts is
 * also rejected server-side if invoked out of policy - the dialog is UX, not a
 * security boundary.
 */
export function Dialog({
  open,
  title,
  description,
  onClose,
  children,
  footer,
}: DialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-lg rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
        {description && (
          <p className="mt-1 text-sm text-slate-400">{description}</p>
        )}

        {children && <div className="mt-4 space-y-4">{children}</div>}

        <div className="mt-6 flex justify-end gap-2">
          {footer ?? (
            <Button type="button" variant="secondary" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}