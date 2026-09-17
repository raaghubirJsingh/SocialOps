import { Badge } from '@/components/ui/badge';
import { CONTENT_STATUS_LABELS, type ContentStatus } from '@/types/content';

const VARIANTS: Readonly<
  Record<ContentStatus, 'neutral' | 'info' | 'warning' | 'danger' | 'success' | 'muted'>
> = Object.freeze({
  DRAFT: 'neutral',
  IN_REVIEW: 'warning',
  CHANGES_REQUESTED: 'danger',
  APPROVED: 'success',
  ARCHIVED: 'muted',
  AWAITING_MANAGER_APPROVAL: 'info',
  UNDER_CLIENT_REVIEW: 'warning',
  FINAL_CONFIRMED: 'success',
});

/** Colour-coded Content status pill (DRAFT / IN_REVIEW / … / ARCHIVED). */
export function ContentStatusBadge({ status }: { status: ContentStatus }) {
  return <Badge variant={VARIANTS[status]}>{CONTENT_STATUS_LABELS[status]}</Badge>;
}