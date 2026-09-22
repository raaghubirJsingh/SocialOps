'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { packCreateRawDataRequest } from '@/components/client/raw-data/raw-data-request-wizard';
import { StoryInputStep } from '@/components/client/raw-data/simple/story-input-step';
import {
  UnderstandingStep,
  type FieldValue,
} from '@/components/client/raw-data/simple/understanding-step';
import { SubmissionConfirmation } from '@/components/client/raw-data/submission-confirmation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSession } from '@/hooks/use-session';
import { useSimpleRawDataDraft } from '@/hooks/use-simple-raw-data-draft';
import { describeApiError } from '@/lib/api-error-messages';
import { rawDataApi } from '@/lib/raw-data-api';
import {
  deriveRawDataFromStory,
  PROVISIONAL_STORY_MIN_LENGTH,
  PROVISIONAL_STORY_MAX_LENGTH,
  type DerivationResult,
  type RawDataMetadataKey,
} from '@/lib/raw-data-derivation';
import {
  applyFreshDerivation,
  composeValues,
  sanitizeOverrides,
  type Overrides,
} from '@/lib/raw-data-request-state';
import type { RawDataDto } from '@/types/content';

/**
 * P1 - simplified, text-first client request flow (web only).
 *
 * Two screens:
 *   1. ONE primary free-text input (story, context and extra notes together);
 *   2. a transparency/correction screen showing what was understood.
 *
 * Derived values are rules-only and deterministic
 * (`@/lib/raw-data-derivation`): no LLM, no new endpoint, no backend call for
 * derivation. Submission REUSES the existing packing helper
 * (`packCreateRawDataRequest`) and the existing insert-only endpoint
 * (`rawDataApi.createMine` -> `POST /api/client/me/raw-data`), so the API
 * contract, the metadata key vocabulary and the data model are unchanged.
 *
 * PROVISIONAL UX BEHAVIOUR: the clarification behaviour below (which gaps are
 * asked about and how many questions are shown) is provisional and comes from
 * the PROVISIONAL block in `@/lib/raw-data-derivation`. It is NOT a business
 * question policy and is expected to be replaced by the D6/D9 policy in P2.
 * No part of it is enforced server-side or in validation.
 */
export function SimpleRawDataRequest({ clientId }: { clientId: string }) {
  const { session, isLoading } = useSession();
  const { save, load, clear } = useSimpleRawDataDraft(clientId);

  // Restore this flow's OWN draft key (never the legacy wizard key).
  //
  // This uses the repo's existing hydration-safe pattern for localStorage-backed
  // state - a lazy initializer rather than
  // `useEffect(() => setState(load()), [])` (see hooks/use-session.tsx, which
  // cites the same React Compiler rule). It is safe here because this component
  // renders below the page's `useSearchParams` Suspense boundary, so it is
  // client-rendered (server render uses the Suspense fallback).
  const [initial] = useState(() => {
    const draft = load();
    if (!draft || draft.story.trim().length === 0) return null;
    const derived = deriveRawDataFromStory(draft.story);
    return {
      story: draft.story,
      derivation: derived,
      // Derivation is deterministic, so it is recomputed from the story on
      // restore (identical output). Only the client's corrections need
      // persisting (R1). Old drafts without `overrides` map their composed
      // `values` to overrides (harmless: they re-assert the same values).
      lastDerivedStory: draft.story.trim(),
      overrides: sanitizeOverrides(draft.overrides ?? draft.values),
      step: (draft.step === 1 ? 1 : 0) as 0 | 1,
    };
  });

  const [story, setStory] = useState(initial?.story ?? '');
  const [step, setStep] = useState<0 | 1>(initial?.step ?? 0);
  const [derivation, setDerivation] = useState<DerivationResult | null>(
    initial?.derivation ?? null,
  );
  // R1: the story text the current derivation was computed from. Derivation
  // is re-run ONLY when this stops matching the story (see goToReview).
  const [lastDerivedStory, setLastDerivedStory] = useState(initial?.lastDerivedStory ?? '');
  // R1: client corrections / question answers - the value of record for their
  // keys. Screen 2 receives COMPOSED values (derivation + overrides, below);
  // edits write to overrides and never re-run derivation.
  const [overrides, setOverrides] = useState<Overrides>(initial?.overrides ?? {});
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [record, setRecord] = useState<RawDataDto | null>(null);

  // Composed values (derivation + overrides): what Screen 2 shows and what is
  // submitted. Recomputed on render only - derivation is NOT re-run here (R1).
  const composedValues = useMemo(
    () => composeValues(derivation, overrides),
    [derivation, overrides],
  );

  // Autosave (external system only - no state is set here). The client's
  // corrections (overrides) are persisted; derivation is recomputed on restore.
  useEffect(() => {
    if (!derivation && story.trim().length === 0) return;
    save({ story, overrides, step });
  }, [story, overrides, step, derivation, save]);

  // R1: Screen 2 edits write to overrides (the value of record for that key).
  // No derivation runs; the composed view updates on render.
  const handleValueChange = useCallback((key: RawDataMetadataKey, next: FieldValue) => {
    setOverrides((previous) => ({ ...previous, [key]: next }));
  }, []);

  const goToReview = useCallback(() => {
    const trimmed = story.trim();
    if (trimmed.length < PROVISIONAL_STORY_MIN_LENGTH) {
      setNotice('Please tell us what you need first.');
      return;
    }
    if (trimmed.length > PROVISIONAL_STORY_MAX_LENGTH) {
      setNotice(`Please keep it under ${PROVISIONAL_STORY_MAX_LENGTH} characters.`);
      return;
    }
    setNotice(null);
    // R1: derivation runs ONLY on first entry or when the story text changed.
    // Back -> Continue with an unchanged story never re-derives, so the
    // client's Screen 2 corrections remain the value of record for their keys.
    if (derivation && trimmed === lastDerivedStory) {
      setStep(1);
      return;
    }
    const previous = derivation;
    const next = deriveRawDataFromStory(trimmed);
    // Approved staleness rule: an override for key K survives this
    // re-derivation only while K's derivation is unchanged by the story edit
    // (pure logic in lib/raw-data-request-state.ts).
    setOverrides((current) => applyFreshDerivation(previous, next, current));
    setDerivation(next);
    setLastDerivedStory(trimmed);
    setStep(1);
  }, [derivation, lastDerivedStory, story]);

  const backToStory = useCallback(() => {
    setNotice(null);
    setStep(0);
  }, []);

  const submit = useCallback(async () => {
    const trimmed = story.trim();
    if (trimmed.length < PROVISIONAL_STORY_MIN_LENGTH) {
      setStep(0);
      setNotice('Please tell us what you need first.');
      return;
    }
    setSubmitting(true);
    setNotice(null);
    try {
      // Same packing path and payload shape as the legacy wizard: the story is
      // `extractedText`, composed values (derivation + R1 overrides) ride in
      // `metadata` under EXISTING keys. No API/contract change.
      const request = packCreateRawDataRequest({
        ...composeValues(derivation, overrides),
        brief: trimmed,
      });
      const result = await rawDataApi.createMine(clientId, request);
      setRecord(result);
      setSubmitted(true);
      clear();
    } catch (error) {
      setNotice(describeApiError(error, 'Unable to submit the request. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  }, [clear, clientId, derivation, overrides, story]);

  const startOver = useCallback(() => {
    clear();
    setStory('');
    setStep(0);
    setDerivation(null);
    setLastDerivedStory('');
    setOverrides({});
    setNotice(null);
    setRecord(null);
    setSubmitted(false);
  }, [clear]);



  if (isLoading) return <p className="text-sm text-slate-400">Loading…</p>;
  if (!session) return <p className="text-sm text-slate-400">Please sign in to create a request.</p>;
  if (submitted) {
    return <SubmissionConfirmation onCreateAnother={startOver} record={record ?? undefined} />;
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Create content request</CardTitle>
          <CardDescription>
            {step === 0
              ? 'Tell us what you need - one box is enough.'
              : 'Check what we understood before you send it.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {step === 0 ? (
            <StoryInputStep
              value={story}
              onChange={setStory}
              onContinue={goToReview}
              notice={notice}
            />
          ) : (
            <UnderstandingStep
              story={story}
              understood={derivation?.understood ?? []}
              toCheck={derivation?.toCheck ?? []}
              questions={derivation?.questions ?? []}
              values={composedValues}
              onValueChange={handleValueChange}
              onEditStory={backToStory}
              onSubmit={submit}
              submitting={submitting}
              notice={notice}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
