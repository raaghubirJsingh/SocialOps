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
  /**
   * When false the dialog is MANDATORY: Escape and backdrop clicks do not
   * dismiss it, and the default "Close" button is not rendered. Use only
   * where the user must complete or explicitly decline - never for a
   * convenience overlay. Defaults to true so every existing caller keeps
   * its current behaviour.
   */
  dismissible?: boolean;
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
  dismissible = true,
}: DialogProps) {
  useEffect(() => {
    if (!open || !dismissible) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose, dismissible]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      role="presentation"
      // A mandatory dialog ignores backdrop clicks entirely, so the only
      // way out is the explicit action in the footer.
      onClick={dismissible ? onClose : undefined}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="surface-glass max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
        {description && (
          <p className="mt-1 text-sm text-slate-400">{description}</p>
        )}

        {children && <div className="mt-4 space-y-4">{children}</div>}

        <div className="mt-6 flex justify-end gap-2">
          {footer ??
            (dismissible ? (
              <Button type="button" variant="secondary" onClick={onClose}>
                Close
              </Button>
            ) : null)}
        </div>
      </div>
    </div>
  );
}