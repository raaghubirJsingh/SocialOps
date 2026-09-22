'use client';

import { useState } from 'react';

import { MultiSelectChips, SingleSelect, TextField } from '@/components/client/raw-data/fields';
import { Button } from '@/components/ui/button';
import {
  describeFieldValue,
  type DerivedField,
  type DerivationQuestion,
  type RawDataMetadataKey,
} from '@/lib/raw-data-derivation';
import type { FieldValue } from '@/lib/raw-data-request-state';

// R1: the value type lives in the pure state module (`lib/raw-data-request-state.ts`)
// so the state/merge logic can use it without importing from a component.
// Re-exported here so existing imports of `FieldValue` keep working unchanged.
export type { FieldValue };

interface EditorProps {
  label: string;
  kind: 'single' | 'multi';
  options?: readonly string[];
  value: FieldValue | undefined;
  onChange: (next: FieldValue) => void;
}

/** One editable control for a derived value (reuses the existing field kit). */
function ValueEditor({ label, kind, options, value, onChange }: EditorProps) {
  if (kind === 'multi' && options) {
    return (
      <MultiSelectChips
        label={label}
        options={options}
        value={Array.isArray(value) ? value : []}
        onChange={onChange}
      />
    );
  }
  if (options) {
    return (
      <SingleSelect
        label={label}
        options={options}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  return (
    <TextField
      label={label}
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

interface Props {
  story: string;
  understood: DerivedField[];
  toCheck: DerivedField[];
  questions: DerivationQuestion[];
  values: Record<string, FieldValue>;
  onValueChange: (key: RawDataMetadataKey, value: FieldValue) => void;
  onEditStory: () => void;
  onSubmit: () => void;
  submitting?: boolean;
  notice?: string | null;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{title}</p>
      <div className="grid gap-3">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs">
      <span className="text-slate-400">{label}</span>
      <span className="min-w-0 text-right text-slate-200">{children}</span>
    </div>
  );
}

/**
 * P1 Screen 2 - TRANSPARENCY AND CORRECTION, never taxonomy confirmation.
 *
 * PROVISIONAL UX BEHAVIOUR: which questions appear, in what order, and the
 * default cap on how many, all come from the PROVISIONAL block in
 * `@/lib/raw-data-derivation` (PROVISIONAL_ASK_POLICY /
 * PROVISIONAL_QUESTION_GROUP_LIMIT). These are provisional defaults and NOT an
 * approved business-required question policy - D6 (materiality) and D9
 * (low-confidence/question policy) replace them in P2. Nothing here is a
 * validation rule.
 *
 * A question's suggestion is shown as a hint only; it is never pre-submitted,
 * so an ignored question can never turn into guessed data.
 */
export function UnderstandingStep({
  story,
  understood,
  toCheck,
  questions,
  values,
  onValueChange,
  onEditStory,
  onSubmit,
  submitting,
  notice,
}: Props) {
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const nothingDetected =
    understood.length === 0 && toCheck.length === 0 && questions.length === 0;

  return (
    <div className="grid gap-6">
      <p className="text-sm text-slate-300">
        Here is what we understood from what you wrote. Change anything that is not right.
      </p>

      {nothingDetected ? (
        <p className="text-xs text-slate-400">
          We did not need any extra detail - you can send this as it is.
        </p>
      ) : null}

      {understood.length > 0 ? (
        <Section title="What we understood">
          {understood.map((field) => {
            if (editing[field.key]) {
              return (
                <ValueEditor
                  key={field.key}
                  label={field.label}
                  kind={field.kind}
                  options={field.options}
                  value={values[field.key]}
                  onChange={(next) => onValueChange(field.key, next)}
                />
              );
            }
            return (
              <Row key={field.key} label={field.label}>
                <span>{describeFieldValue(values[field.key])}</span>
                <Button
                  type="button"
                  variant="ghost"
                  className="ml-2 h-6 px-2 text-[11px]"
                  onClick={() =>
                    setEditing((previous) => ({ ...previous, [field.key]: true }))
                  }
                >
                  Change
                </Button>
              </Row>
            );
          })}
        </Section>
      ) : null}

      {toCheck.length > 0 ? (
        <Section title="Please check these">
          {toCheck.map((field) => (
            <div key={field.key} className="grid gap-2">
              <p className="text-xs text-amber-300">Please check: {field.label}</p>
              <ValueEditor
                label={field.label}
                kind={field.kind}
                options={field.options}
                value={values[field.key]}
                onChange={(next) => onValueChange(field.key, next)}
              />
            </div>
          ))}
        </Section>
      ) : null}

      {questions.length > 0 ? (
        <Section title="A few quick questions">
          {questions.map((question) => (
            <div
              key={question.key}
              className="grid gap-2 rounded-lg border border-white/[0.06] p-3"
            >
              <p className="text-sm text-slate-200">{question.prompt}</p>
              <p className="text-[11px] text-slate-500">{question.reason}</p>
              {question.suggestedValue ? (
                <p className="text-[11px] text-slate-400">
                  You mentioned: {describeFieldValue(question.suggestedValue)}
                </p>
              ) : null}
              <ValueEditor
                label={question.label}
                kind={question.kind}
                options={question.options}
                value={values[question.key]}
                onChange={(next) => onValueChange(question.key, next)}
              />
            </div>
          ))}
        </Section>
      ) : null}

      <Section title="Your request text">
        <p className="whitespace-pre-wrap rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-xs text-slate-300">
          {story}
        </p>
        <div>
          <Button type="button" variant="secondary" onClick={onEditStory}>
            Edit the story
          </Button>
        </div>
      </Section>

      {notice ? (
        <p role="status" className="text-sm text-slate-300">
          {notice}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="secondary" onClick={onEditStory}>
          Back
        </Button>
        <Button type="button" onClick={onSubmit} disabled={submitting}>
          {submitting ? 'Sending…' : 'Send request'}
        </Button>
      </div>
    </div>
  );
}

