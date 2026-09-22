/**
 * P1 simplified (text-first) request flow - structural contracts.
 *
 * These read the P1 sources directly (the web jest environment is `node`, so
 * component rendering is not available; the existing suites use the same
 * module-source assertion style). They lock the APPROVED P1 shape:
 *   - ONE primary free-text input on Screen 1, no second text field;
 *   - NO asset/upload affordance in P1 (assets are P3, gated by D2/D3/D4);
 *   - submission reuses the existing packing helper + insert-only endpoint;
 *   - the simplified flow never touches the legacy draft key;
 *   - legacy wizard/fields are preserved (nothing physically deleted);
 *   - the clarification behaviour stays marked PROVISIONAL (D6/D9 replace it).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { WIZARD_STEPS, rawDataRequestSchema } from '@/types/raw-data';

const read = (relativePath: string): string =>
  readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

const count = (source: string, token: string): number => source.split(token).length - 1;

const SIMPLE_DIR = 'components/client/raw-data/simple';
const P1_FILES = [
  `${SIMPLE_DIR}/story-input-step.tsx`,
  `${SIMPLE_DIR}/understanding-step.tsx`,
  `${SIMPLE_DIR}/simple-raw-data-request.tsx`,
];

describe('P1 Screen 1 - one primary input', () => {
  it('renders exactly one free-text input and no other field controls', () => {
    const source = read(`${SIMPLE_DIR}/story-input-step.tsx`);
    expect(count(source, '<TextareaField')).toBe(1);
    // Every textarea-like tag is that one field (no extra raw textarea).
    expect(count(source, '<Textarea')).toBe(count(source, '<TextareaField'));
    expect(count(source, '<TextField')).toBe(0);
    expect(count(source, '<SingleSelect')).toBe(0);
    expect(count(source, '<MultiSelectChips')).toBe(0);
  });

  it('has no second free-text input on the flow (Screen 1 only)', () => {
    const source = read(`${SIMPLE_DIR}/story-input-step.tsx`);
    expect(count(source, 'name="')).toBe(0);
    expect(count(source, '<form')).toBe(0);
  });
});

describe('P1 ships no asset/upload affordance', () => {
  it.each(P1_FILES)('%s contains no upload or storage surface', (file) => {
    const source = read(file);
    expect(source).not.toContain('type="file"');
    expect(source).not.toContain('FormData');
    expect(source).not.toContain('storageRef');
    expect(source).not.toContain('uploadUrl');
    expect(source).not.toContain('presigned');
    expect(source).not.toMatch(/add photos/i);
    expect(source).not.toMatch(/videos\/documents/i);
  });

  it.each(P1_FILES)('%s makes no direct network call', (file) => {
    const source = read(file);
    expect(source).not.toContain('fetch(');
    expect(source).not.toContain('XMLHttpRequest');
    expect(source).not.toContain('ai-tasks');
    expect(source).not.toMatch(/openai|anthropic/i);
  });
});

describe('P1 submission reuses the approved backend contract', () => {
  const orchestrator = read(`${SIMPLE_DIR}/simple-raw-data-request.tsx`);

  it('reuses the legacy packing helper instead of duplicating it', () => {
    expect(orchestrator).toContain('packCreateRawDataRequest');
    expect(orchestrator).not.toContain("source: 'CLIENT_FORM'");
    // The payload shape (extractedText / metadata) is built by the helper.
    expect(orchestrator).not.toMatch(/extractedText:/);
    expect(orchestrator).not.toMatch(/metadata:/);
  });

  it('posts through the existing insert-only client endpoint wrapper', () => {
    expect(orchestrator).toContain('rawDataApi.createMine');
    // No raw URL is hard-coded in the flow: the api wrapper owns the path.
    expect(orchestrator).not.toMatch(/'\/client\/me\/raw-data'/);
    expect(orchestrator).not.toMatch(/"\/client\/me\/raw-data"/);
  });

  it('the packing helper is exported by the legacy wizard without changes', () => {
    const wizard = read('components/client/raw-data/raw-data-request-wizard.tsx');
    expect(wizard).toContain('export function packCreateRawDataRequest');
  });
});

describe('P1 keeps its own draft and preserves the legacy draft', () => {
  it('uses a separate localStorage key from the legacy wizard', () => {
    const hook = read('hooks/use-simple-raw-data-draft.ts');
    const keyLine =
      hook.split('\n').find((line) => line.includes('keyFor =')) ?? '';
    expect(keyLine).toContain('so:raw-data-simple-draft:');
    expect(keyLine).not.toContain('so:raw-data-draft:');
  });

  it('does not overwrite the legacy wizard draft key', () => {
    const legacyHook = read('hooks/use-raw-data-draft.ts');
    expect(legacyHook).toContain('so:raw-data-draft:');
  });
});

describe('P1 preserves the legacy wizard and its fields', () => {
  it('keeps the 8-step wizard reachable (nothing deleted or reduced)', () => {
    const page = read('app/(app)/client/content/request/page.tsx');
    expect(page).toContain('RawDataRequestWizard');
    expect(page).toContain('SimpleRawDataRequest');
    expect(page).toContain("params.get('advanced')");
    expect(WIZARD_STEPS).toHaveLength(8);
  });

  it('keeps every legacy metadata key in the front-end schema', () => {
    const keys = Object.keys(rawDataRequestSchema.shape);
    expect(keys).toContain('specialInstructions');
    expect(keys).toContain('additionalInformation');
    expect(keys).toContain('brief');
  });

  it('keeps the legacy notes and reference fields physically in place', () => {
    const steps = read('components/client/raw-data/steps.tsx');
    expect(steps).toContain('name="specialInstructions"');
    expect(steps).toContain('name="additionalInformation"');
    expect(steps).toContain('name="materialType"');
  });
});

describe('P1 clarification behaviour stays explicitly provisional', () => {
  it('marks the derivation policy as provisional and replaceable', () => {
    const engine = read('lib/raw-data-derivation.ts');
    expect(engine).toContain('PROVISIONAL UX BEHAVIOR');
    expect(engine).toContain('NOT a business-required question policy');
    expect(engine).toContain('D6');
    expect(engine).toContain('D9');
    expect(engine).toContain('PROVISIONAL_ASK_POLICY');
    expect(engine).toContain('PROVISIONAL_QUESTION_GROUP_LIMIT');
    // No server-side enforcement of the provisional policy.
    expect(engine).not.toContain('fetch(');
  });

  it('marks Screen 2 as provisional and non-validating', () => {
    const screen = read(`${SIMPLE_DIR}/understanding-step.tsx`);
    expect(screen).toContain('PROVISIONAL');
    expect(screen).toMatch(/not a (business-required )?question policy|validation rule/i);
  });

  it('shows Screen 2 as transparency and correction, not taxonomy confirmation', () => {
    const screen = read(`${SIMPLE_DIR}/understanding-step.tsx`);
    expect(screen).toContain('What we understood');
    expect(screen).toContain('Change');
    expect(screen).toContain('You mentioned:');
    expect(screen).toContain('Send request');
  });
});


describe('R1 correction persistence contracts', () => {
  it('guards re-derivation behind a story comparison (no unconditional re-derive)', () => {
    const orchestrator = read(`${SIMPLE_DIR}/simple-raw-data-request.tsx`);
    expect(orchestrator).toContain('lastDerivedStory');
    expect(orchestrator).toContain('trimmed === lastDerivedStory');
    expect(orchestrator).toContain('applyFreshDerivation');
    expect(orchestrator).toContain('composeValues');
  });

  it('writes Screen 2 edits to overrides and submits composed values', () => {
    const orchestrator = read(`${SIMPLE_DIR}/simple-raw-data-request.tsx`);
    expect(orchestrator).toContain('setOverrides');
    expect(orchestrator).toContain('values={composedValues}');
    expect(orchestrator).toMatch(
      /packCreateRawDataRequest\(\{\s*\.\.\.composeValues\(derivation, overrides\)/,
    );
  });

  it('persists overrides in the existing simple-flow draft key (no new key)', () => {
    const hook = read('hooks/use-simple-raw-data-draft.ts');
    expect(hook).toContain('overrides?');
    const keyLine = hook.split('\n').find((line) => line.includes('keyFor =')) ?? '';
    expect(keyLine).toContain('so:raw-data-simple-draft:');
    expect(keyLine).not.toContain('so:raw-data-draft:');
  });
});

