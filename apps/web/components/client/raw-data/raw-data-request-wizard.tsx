'use client';

import { useCallback, useEffect, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ReviewSummary } from '@/components/client/raw-data/review-summary';
import {
  StepAudience,
  StepBasic,
  StepContentInfo,
  StepDetails,
  StepLanguageStyle,
  StepPublishing,
  StepReference,
  StepReview,
} from '@/components/client/raw-data/steps';
import { SubmissionConfirmation } from '@/components/client/raw-data/submission-confirmation';
import { WizardStepper } from '@/components/client/raw-data/wizard-stepper';
import { useRawDataDraft } from '@/hooks/use-raw-data-draft';
import { useSession } from '@/hooks/use-session';
import { describeApiError } from '@/lib/api-error-messages';
import { rawDataApi } from '@/lib/raw-data-api';
import type { CreateRawDataRequest, RawDataDto } from '@/types/content';
import {
  RAW_DATA_REQUEST_DEFAULTS,
  WIZARD_STEPS,
  audienceStepSchema,
  basicStepSchema,
  contentInfoStepSchema,
  detailsStepSchema,
  languageStyleStepSchema,
  publishingStepSchema,
  rawDataRequestSchema,
  referenceStepSchema,
  reviewStepSchema,
  type WizardValues,
} from '@/types/raw-data';

/** Hand-rolled RHF resolver (register-form pattern): no new deps. */
const emptyResolver: Resolver<WizardValues> = async (values) => ({
  values: values as WizardValues,
  errors: {},
});

/**
 * Pack the wizard's validated values into a CreateRawDataRequest for the
 * backend. The structured brief fields are stored as metadata JSON; the main
 * text body (brief) is sent as extractedText. File-upload fields (mimeType,
 * originalFileName, byteSize) are left unset because V1 has no file upload.
 */
function packCreateRawDataRequest(values: Record<string, unknown>): CreateRawDataRequest {
  const metadata: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      const filtered = value.filter((v) => v !== '' && v !== null && v !== undefined);
      if (filtered.length > 0) {
        metadata[key] = filtered.join(', ');
      }
    } else if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) metadata[key] = trimmed;
    } else {
      metadata[key] = value;
    }
  }

  const brief = (values.brief as string | undefined)?.trim() || '';

  return {
    source: 'CLIENT_FORM',
    extractedText: brief || undefined,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };
}

const STEP_SCHEMAS = [
  basicStepSchema,
  audienceStepSchema,
  languageStyleStepSchema,
  contentInfoStepSchema,
  detailsStepSchema,
  referenceStepSchema,
  publishingStepSchema,
  reviewStepSchema,
];

export function RawDataRequestWizard({ clientId }: { clientId: string }) {
  const { session, isLoading } = useSession();
  const { save, load, clear } = useRawDataDraft(clientId);
  const [active, setActive] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submittedRecord, setSubmittedRecord] = useState<RawDataDto | null>(null);

  const form = useForm<WizardValues>({
    resolver: emptyResolver,
    mode: 'onBlur',
    shouldUnregister: true,
    defaultValues: RAW_DATA_REQUEST_DEFAULTS as WizardValues,
  });
  const { control, getValues, reset, formState, watch } = form;
  const errors = formState.errors;
  const contentCategory = watch('contentCategory') ?? '';
  const contentPurpose = watch('contentPurpose') ?? '';
  const ctaValue = watch('cta') ?? '';
  const registrationValue = watch('registrationRequired') ?? '';
  const contactValue = watch('contactSource') ?? '';
  const visited = WIZARD_STEPS.map((_, i) => i <= active);

  useEffect(() => {
    const draft = load();
    if (draft) reset({ ...RAW_DATA_REQUEST_DEFAULTS, ...draft } as WizardValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const goNext = useCallback(() => {
    const schema = STEP_SCHEMAS[active];
    const probe = { ...getValues(), contentCategory, contentPurpose } as Record<string, unknown>;
    const parsed = schema.safeParse(probe);
    if (!parsed.success) {
      setNotice(`Step ${active + 1} needs attention (${parsed.error.issues.length} issue(s)).`);
      return;
    }
    setNotice(null);
    setActive((a) => Math.min(a + 1, WIZARD_STEPS.length - 1));
  }, [active, getValues, contentCategory, contentPurpose]);

  const saveDraft = useCallback(() => {
    const ok = save(getValues() as Record<string, unknown>);
    setNotice(ok ? 'Draft saved on this device.' : 'Could not save the draft.');
  }, [getValues, save]);

  const submit = useCallback(async () => {
    const full = { ...RAW_DATA_REQUEST_DEFAULTS, ...(getValues() as Record<string, unknown>) };
    const parsed = rawDataRequestSchema.safeParse(full);
    if (!parsed.success) {
      setNotice(`Request is incomplete (${parsed.error.issues.length} issue(s)).`);
      return;
    }
    setNotice(null);

    const request = packCreateRawDataRequest(full);

    try {
      const result = await rawDataApi.createMine(clientId, request);
      setSubmittedRecord(result);
      setSubmitted(true);
    } catch (error) {
      setNotice(describeApiError(error, 'Unable to submit the request. Please try again.'));
    }
  }, [getValues, clientId]);

  const startOver = useCallback(() => {
    clear();
    reset(RAW_DATA_REQUEST_DEFAULTS as WizardValues);
    setActive(0);
    setSubmitted(false);
    setNotice(null);
  }, [clear, reset]);

  if (isLoading) return <p className="text-sm text-slate-400">Loading…</p>;
  if (!session) return <p className="text-sm text-slate-400">Please sign in to create a request.</p>;
  if (submitted) return <SubmissionConfirmation onCreateAnother={startOver} record={submittedRecord ?? undefined} />;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Create content request</CardTitle>
          <CardDescription>
            Step {active + 1} of {WIZARD_STEPS.length} — {WIZARD_STEPS[active]}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <WizardStepper active={active} visited={visited} onJump={setActive} />
          {active === 0 ? <StepBasic control={control} errors={errors} /> : null}
          {active === 1 ? <StepAudience control={control} errors={errors} /> : null}
          {active === 2 ? <StepLanguageStyle control={control} errors={errors} /> : null}
          {active === 3 ? <StepContentInfo control={control} errors={errors} /> : null}
          {active === 4 ? (
            <StepDetails
              control={control}
              errors={errors}
              contentCategory={contentCategory}
              contentPurpose={contentPurpose}
              ctaValue={ctaValue}
              registrationValue={registrationValue}
              contactValue={contactValue}
            />
          ) : null}
          {active === 5 ? <StepReference control={control} errors={errors} /> : null}
          {active === 6 ? <StepPublishing control={control} errors={errors} /> : null}
          {active === 7 ? (
            <>
              <StepReview control={control} errors={errors} />
              <ReviewSummary values={getValues() as Record<string, unknown>} />
            </>
          ) : null}
          {notice ? (
            <p role="status" className="text-sm text-slate-300">
              {notice}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="secondary" onClick={() => setActive((a) => Math.max(a - 1, 0))} disabled={active === 0}>
              Back
            </Button>
            {active < WIZARD_STEPS.length - 1 ? (
              <Button type="button" onClick={goNext}>
                Next
              </Button>
            ) : (
              <Button type="button" onClick={submit}>
                Submit request
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={saveDraft}>
              Save as draft
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
