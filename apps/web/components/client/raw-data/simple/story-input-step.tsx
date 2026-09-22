'use client';

import { Button } from '@/components/ui/button';
import { TextareaField } from '@/components/client/raw-data/fields';
import { PROVISIONAL_STORY_MAX_LENGTH } from '@/lib/raw-data-derivation';

interface Props {
  value: string;
  onChange: (next: string) => void;
  onContinue: () => void;
  notice?: string | null;
}

/**
 * P1 Screen 1 - ONE primary free-text input.
 *
 * Deliberately minimal and text-first:
 *   - exactly ONE free-text input carries the story, the context and anything
 *     else the client wants to add (no second text field, no taxonomy pickers);
 *   - no asset/upload affordance of any kind (assets are P3-only, after
 *     D2/D3/D4 and the storage governance question are resolved - a control
 *     that could not actually upload would be a false affordance).
 *
 * Copy here is PROPOSED UX draft wording (D10, finalized in P5).
 */
export function StoryInputStep({ value, onChange, onContinue, notice }: Props) {
  return (
    <div className="grid gap-4">
      <TextareaField
        label="Tell us what you need"
        required
        rows={10}
        maxLength={PROVISIONAL_STORY_MAX_LENGTH}
        placeholder="Write it the way you would explain it to a colleague: what it is, who it is for, when it should go out, and anything else we should keep in mind."
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <p className="text-xs text-slate-400">
        One box is enough. We will read it and show you what we understood before anything is
        submitted, so you can correct us.
      </p>
      {notice ? (
        <p role="status" className="text-sm text-slate-300">
          {notice}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={onContinue}>
          Continue
        </Button>
      </div>
    </div>
  );
}
