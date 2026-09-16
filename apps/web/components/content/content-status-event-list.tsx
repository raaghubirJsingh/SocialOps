import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CONTENT_STATUS_LABELS, type ContentStatusEventDto } from '@/types/content';

/**
 * Append-only status-transition audit trail (newest first).
 *
 * There is no route that can edit or delete these rows, so this component is
 * strictly read-only. It shows who moved the item, from where to where, in
 * which role, and the note they left - the human-readable half of the
 * "publishing only after Final Confirmation" guarantee.
 */
export function ContentStatusEventList({
  events,
}: {
  events: ContentStatusEventDto[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Status history</CardTitle>
        <CardDescription>
          Append-only record of every status change, including who made it and why.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {events.length === 0 ? (
          <p className="text-sm text-slate-400">No status changes recorded yet.</p>
        ) : (
          <ul className="space-y-2">
            {events.map((event) => (
              <li
                key={event.id}
                className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-slate-300">
                    {event.fromStatus
                      ? `${CONTENT_STATUS_LABELS[event.fromStatus]} → ${CONTENT_STATUS_LABELS[event.toStatus]}`
                      : CONTENT_STATUS_LABELS[event.toStatus]}
                  </span>
                  {event.actorRole && (
                    <Badge variant="muted">
                      {event.actorRole === 'CLIENT_OWNER'
                        ? 'Client owner'
                        : 'Agency admin'}
                    </Badge>
                  )}
                </div>
                {event.note && (
                  <p className="mt-1 text-xs text-slate-400">{event.note}</p>
                )}
                <p className="mt-1 text-xs text-slate-500">
                  {new Date(event.createdAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}