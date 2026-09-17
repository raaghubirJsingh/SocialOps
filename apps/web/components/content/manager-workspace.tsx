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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  useAgencyContent,
  useAgencyInternalNotes,
  useAgencyRevisions,
  useProcessAiTask,
  useTransitionAgencyContent,
} from '@/hooks/use-content-operations';
import { describeApiError } from '@/lib/api-error-messages';
import type { ContentRevisionDto } from '@/types/content';

/**
 * Phase 4 (Integration) — Agency workspace, now wired to the real Phase 2 API.
 *
 * - Smart Assignment dropdown dispatches POST .../ai-tasks with the selected
 *   AI bot's UUID (aiUserId). The backend requires isBot=true, so only AI
 *   bots are offered.
 * - Submit for client review calls POST .../status with
 *   { to: 'UNDER_CLIENT_REVIEW' } (requires the TRANSITION_TARGETS backend
 *   fix in this same change).
 * - Internal notes render ONLY the agency-scoped query; the client portal
 *   never imports this panel or its hook (boundary preserved).
 */
export interface ManagerWorkspaceProps {
  clientId: string;
  contentId: string;
  /** AI employees available for dispatch (id MUST be the real AI User UUID). */
  aiBots?: ReadonlyArray<{ id: string; name: string; skill: string }>;
}

export function ManagerWorkspace({ clientId, contentId, aiBots = [] }: ManagerWorkspaceProps) {
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const contentQuery = useAgencyContent(clientId, contentId);
  const notesQuery = useAgencyInternalNotes(clientId, contentId);
  const revisionsQuery = useAgencyRevisions(clientId, contentId);
  const aiTask = useProcessAiTask(clientId, contentId);
  const transition = useTransitionAgencyContent(clientId, contentId);
  const [actionError, setActionError] = useState<string | null>(null);

  const content = contentQuery.data ?? null;
  const latestRevision: ContentRevisionDto | null =
    (revisionsQuery.data ?? []).slice().sort((a, b) => b.revision - a.revision)[0] ?? null;
  const assignee = aiBots.find((a) => a.id === assigneeId) ?? null;

  const configured = Boolean(clientId) && Boolean(contentId);

  async function dispatchAiTask(botId: string) {
    setAssigneeId(botId);
    setActionError(null);
    try {
      await aiTask.mutateAsync({
        aiUserId: botId,
        prompt: `Generate a draft revision for "${content?.title ?? contentId}".`,
        outputType: 'revision',
      });
    } catch (err) {
      setActionError(describeApiError(err, 'Could not dispatch the AI task.'));
    }
  }

  async function submitForReview() {
    setActionError(null);
    try {
      await transition.mutateAsync({ to: 'UNDER_CLIENT_REVIEW' });
    } catch (err) {
      setActionError(describeApiError(err, 'Could not submit for client review.'));
    }
  }
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">Agency workspace</CardTitle>
          {content?.scenarioType ? (
            <Badge variant="info">{content.scenarioType.replace('_', ' ')}</Badge>
          ) : null}
          {content ? (
            <Badge variant="warning">{content.status.replaceAll('_', ' ')}</Badge>
          ) : null}
        </div>
        <CardDescription>
          Assign a writer, refine the draft against private internal notes, then
          submit it for client review.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {!configured ? (
          <div role="status" className="rounded-lg border border-amber-900/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-300">
            Pass a clientId and contentId to load this workspace.
          </div>
        ) : null}
        {contentQuery.isLoading || revisionsQuery.isLoading ? (
          <div role="status" className="text-sm text-slate-400">Loading content…</div>
        ) : null}
        {contentQuery.isError ? (
          <div role="alert" className="rounded-lg border border-rose-900/60 bg-rose-950/30 px-4 py-3 text-sm text-rose-300">
            {describeApiError(contentQuery.error, 'Could not load content.')}
          </div>
        ) : null}
        {transition.isSuccess && content?.status === 'UNDER_CLIENT_REVIEW' ? (
          <div role="status" className="rounded-lg border border-emerald-900/60 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-300">
            Submitted — content is now under client review.
          </div>
        ) : null}
        {actionError ? (
          <div role="alert" className="rounded-lg border border-rose-900/60 bg-rose-950/30 px-4 py-3 text-sm text-rose-300">
            {actionError}
          </div>
        ) : null}

        <div className="grid gap-2">
          <Label>Smart assignment</Label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" className="w-full justify-start text-left font-normal">
                {assignee ? (
                  <span className="flex w-full items-center gap-2">
                    <span className="flex-1 truncate text-slate-100">
                      {assignee.name} · {assignee.skill}
                    </span>
                    <Badge variant="info">AI bot</Badge>
                  </span>
                ) : (
                  <span className="text-slate-400">Select an AI employee…</span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              <DropdownMenuLabel>AI employees</DropdownMenuLabel>
              {aiBots.length === 0 ? (
                <DropdownMenuItem disabled>No AI employees configured</DropdownMenuItem>
              ) : (
                aiBots.map((bot) => (
                  <DropdownMenuItem
                    key={bot.id}
                    className="cursor-pointer"
                    onSelect={() => void dispatchAiTask(bot.id)}
                  >
                    <span className="flex-1 truncate">
                      {bot.name} - {bot.skill}
                    </span>
                    <Badge variant="info">AI bot</Badge>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <p className="text-xs text-slate-400">
            Selecting an AI employee dispatches POST …/ai-tasks with that bot&apos;s UUID.
            AI employees act under the MEMBER role, like any other team member.
            {aiTask.isPending ? ' Dispatching…' : ''}
            {aiTask.isSuccess ? ' Dispatched.' : ''}
          </p>
        </div>

        <Separator />

        <ManagerDraftPanel
          title={latestRevision?.title ?? content?.title ?? '—'}
          body={latestRevision?.body ?? content?.body ?? '—'}
          revision={latestRevision?.revision ?? null}
        />

        <Separator />

        <ManagerInternalNotesPanel
          notes={(notesQuery.data ?? []).map((n) => ({
            id: n.id,
            author: n.authorId,
            createdAt: n.createdAt,
            body: n.body,
          }))}
          isLoading={notesQuery.isLoading}
          error={notesQuery.isError ? describeApiError(notesQuery.error, 'Could not load internal notes.') : null}
        />
      </CardContent>

      <CardFooter>
        <Button
          type="button"
          className="w-full"
          disabled={!configured || transition.isPending || content?.status !== 'AWAITING_MANAGER_APPROVAL'}
          onClick={() => void submitForReview()}
        >
          {transition.isPending ? 'Submitting…' : 'Submit for client review'}
        </Button>
      </CardFooter>
    </Card>
  );
}

interface ManagerInternalNotesPanelProps {
  notes: ReadonlyArray<{ id: string; author: string; createdAt: string; body: string }>;
  isLoading: boolean;
  error: string | null;
}

/** Agency-only internal notes panel (boundary-preserving: never shared with the client). */
function ManagerInternalNotesPanel({ notes, isLoading, error }: ManagerInternalNotesPanelProps) {
  return (
    <section aria-label="Internal notes (agency only)" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-100">Internal notes</h3>
        <Badge variant="warning">Agency only — never shared with client</Badge>
      </div>
      <div className="space-y-2 rounded-md border border-amber-900/60 bg-amber-950/20 p-3">
        {isLoading ? (
          <p className="text-sm text-slate-400">Loading notes…</p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-rose-300">{error}</p>
        ) : null}
        {!isLoading && !error && notes.length === 0 ? (
          <p className="text-sm text-slate-400">No internal notes yet.</p>
        ) : null}
        {notes.map((note) => (
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

interface ManagerDraftPanelProps {
  title: string;
  body: string;
  revision: number | null;
}

/** Internal draft preview (latest revision, or the Content row before any AI pass). */
function ManagerDraftPanel({ title, body, revision }: ManagerDraftPanelProps) {
  return (
    <section aria-label="Internal draft" className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-100">Internal draft</h3>
        <Badge variant="muted">{revision === null ? 'Draft' : `Revision ${revision}`}</Badge>
      </div>
      <article className="rounded-md border border-white/[0.06] bg-slate-950/60 p-4">
        <p className="text-sm font-medium text-slate-100">{title}</p>
        <p className="mt-1 whitespace-pre-line text-sm text-slate-300">{body}</p>
      </article>
    </section>
  );
}

