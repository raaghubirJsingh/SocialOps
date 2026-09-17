'use client';

import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  MOCK_ASSIGNEES,
  MOCK_DRAFT,
  MOCK_INTERNAL_NOTES,
} from '@/components/content/phase3-mocks';

/**
 * Phase 3 (UI-first) Agency workspace preview.
 *
 * Mock data only — no backend calls. Visualises the Agency side of the
 * 3-scenario pipeline: smart assignment (humans + AI bots), the
 * agency-only internal draft panel, and the submit-for-review action.
 */
export function ManagerWorkspace() {
  const [assigneeId, setAssigneeId] = useState<string | null>('ai-1');
  const [submitted, setSubmitted] = useState(false);

  const assignee = MOCK_ASSIGNEES.find((a) => a.id === assigneeId) ?? null;
  const humans = MOCK_ASSIGNEES.filter((a) => !a.isBot);
  const bots = MOCK_ASSIGNEES.filter((a) => a.isBot);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">Agency workspace</CardTitle>
          <Badge variant="info">{MOCK_DRAFT.scenario.replace('_', ' ')}</Badge>
          <Badge variant="warning">
            {MOCK_DRAFT.status.replaceAll('_', ' ')}
          </Badge>
        </div>
        <CardDescription>
          Assign a writer, refine the draft against private internal notes, then
          submit it for client review.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {submitted && (
          <div
            role="status"
            className="rounded-lg border border-emerald-900/60 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-300"
          >
            Mock submit recorded — revision {MOCK_DRAFT.revision} would now move
            to client review. No backend call was made.
          </div>
        )}

        <div className="grid gap-2">
          <Label>Smart assignment</Label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="secondary"
                className="w-full justify-start text-left font-normal"
              >
                {assignee ? (
                  <span className="flex w-full items-center gap-2">
                    <span className="flex-1 truncate text-slate-100">
                      {assignee.name} · {assignee.skill}
                    </span>
                    {assignee.isBot ? (
                      <Badge variant="info">AI bot</Badge>
                    ) : (
                      <Badge variant="neutral">Human</Badge>
                    )}
                  </span>
                ) : (
                  <span className="text-slate-400">Assign a writer…</span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              <DropdownMenuLabel>Team</DropdownMenuLabel>
              {humans.map((person) => (
                <DropdownMenuItem
                  key={person.id}
                  className="cursor-pointer"
                  onSelect={() => setAssigneeId(person.id)}
                >
                  <span className="flex-1 truncate">
                    {person.name} - {person.skill}
                  </span>
                  <Badge variant="neutral">Human</Badge>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>AI employees</DropdownMenuLabel>
              {bots.map((bot) => (
                <DropdownMenuItem
                  key={bot.id}
                  className="cursor-pointer"
                  onSelect={() => setAssigneeId(bot.id)}
                >
                  <span className="flex-1 truncate">
                    {bot.name} - {bot.skill}
                  </span>
                  <Badge variant="info">AI bot</Badge>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <p className="text-xs text-slate-400">
            AI employees act under the MEMBER role, like any other team member.
          </p>
        </div>

        <Separator />

        <ManagerDraftPanel />

        <Separator />

        <ManagerInternalNotesPanel />
      </CardContent>

      <CardFooter>
        <Button
          type="button"
          className="w-full"
          onClick={() => setSubmitted(true)}
        >
          Submit for client review
        </Button>
      </CardFooter>
    </Card>
  );
}

/**
 * Agency-only internal notes panel.
 *
 * Rendered ONLY inside the Agency workspace. The private styling (amber
 * "Agency only — never shared with the client" banner) makes the boundary
 * visible during review. Mock data only.
 */
function ManagerInternalNotesPanel() {
  return (
    <section aria-label="Internal notes (agency only)" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-100">Internal notes</h3>
        <Badge variant="warning">Agency only — never shared with client</Badge>
      </div>
      <div className="space-y-2 rounded-md border border-amber-900/60 bg-amber-950/20 p-3">
        {MOCK_INTERNAL_NOTES.map((note) => (
          <div
            key={note.id}
            className="rounded-md border border-white/[0.06] bg-slate-950/60 px-3 py-2"
          >
            <p className="text-xs text-slate-400">
              {note.author} · {note.createdAt}
            </p>
            <p className="mt-1 text-sm text-slate-200">{note.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Internal draft preview (agency side of the pipeline).
 *
 * Shows the working revision the Agency is refining before it is submitted
 * for client review. Mock data only.
 */
function ManagerDraftPanel() {
  return (
    <section aria-label="Internal draft" className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-100">Internal draft</h3>
        <Badge variant="muted">Revision {MOCK_DRAFT.revision}</Badge>
      </div>
      <article className="rounded-md border border-white/[0.06] bg-slate-950/60 p-4">
        <p className="text-sm font-medium text-slate-100">{MOCK_DRAFT.title}</p>
        <p className="mt-1 whitespace-pre-line text-sm text-slate-300">
          {MOCK_DRAFT.body}
        </p>
      </article>
    </section>
  );
}
