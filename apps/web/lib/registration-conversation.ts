import type { AccountType, DiscoveryAnswers } from '@/types/auth';

/**
 * Registration Phase v1.0 conversational discovery state machine.
 *
 * A PURE, node-Jest-testable module (same discipline as
 * `lib/raw-data-request-state.ts`): no React, no network, no storage.
 * The UI consumes these transitions and renders the approved Hindi copy
 * as conversational messages with contextual option buttons (hybrid UI;
 * free text is an escape hatch elsewhere, never here).
 *
 * Locked rules enforced here:
 *   - "Category is discovered, not declared": the FIRST question is the
 *     approved root question; no Client/Agency/Individual/Business
 *     classification form ever appears.
 *   - Approved branches only (own / mixed / undecided + the two branch
 *     questions + clarification + forced choice).
 *   - Own-only -> CLIENT; own+others (or others-only) -> SERVICE_PROVIDER.
 *   - Undecided: minimum clarification; if still unclear the user MUST
 *     explicitly choose CLIENT or SERVICE_PROVIDER - NEVER guessed (L13).
 *   - Confirmation copy is exact; discovery ends there ([आगे बढ़ें]).
 *   - No question is ever asked twice; known answers are never re-asked.
 *
 * Identity (name/phone/email), verification, and password stages are
 * rendered by the flow component; this module owns discovery plus the
 * discoveryAnswers JSON snapshot (L8) handed to /start.
 */

export type ConversationStage =
  | 'discovery-root'
  | 'discovery-branch'
  | 'clarification'
  | 'forced-choice'
  | 'confirmation'
  | 'identity';

export type DiscoveryRoot = 'own' | 'mixed' | 'undecided';
export type OwnBranch = 'personal' | 'business' | 'both' | 'undecided';
export type MixedBranch = 'clients' | 'individuals' | 'both' | 'undecided';

export interface ConversationState {
  stage: ConversationStage;
  root: DiscoveryRoot | null;
  /** Which branch question is on screen when stage = 'discovery-branch'. */
  branch: 'own' | 'mixed' | null;
  ownBranch: OwnBranch | null;
  mixedBranch: MixedBranch | null;
  /** Null only until confirmation - forced choice guarantees non-null. */
  classification: AccountType | null;
  clarificationAnswer: 'ownOnly' | 'mixed' | 'undecided' | null;
  discoveryAccepted: boolean;
}

export interface OptionDef {
  id: string;
  label: string;
}

// ---------------------------------------------------------------------------
// Approved copy (exact wording from the approved Registration Phase spec).
// ---------------------------------------------------------------------------

export const ROOT_QUESTION = 'आप SocialOps में किन Accounts को manage करना चाहते हैं?';
export const ROOT_OPTIONS: readonly OptionDef[] = [
  { id: 'own', label: 'अपने Accounts' },
  { id: 'mixed', label: 'अपने और दूसरों के Accounts' },
  { id: 'undecided', label: 'अभी तय नहीं है' },
];

export const OWN_QUESTION = 'ये Accounts किसके हैं?';
export const OWN_OPTIONS: readonly OptionDef[] = [
  { id: 'personal', label: 'मेरे Personal Accounts' },
  { id: 'business', label: 'मेरे Business / Brand के Accounts' },
  { id: 'both', label: 'दोनों' },
  { id: 'undecided', label: 'अभी तय नहीं है' },
];

export const MIXED_QUESTION = 'दूसरों के Accounts आप किसके लिए manage करते हैं?';
export const MIXED_OPTIONS: readonly OptionDef[] = [
  { id: 'clients', label: 'Clients / Businesses के' },
  { id: 'individuals', label: 'Individuals के' },
  { id: 'both', label: 'दोनों के' },
  { id: 'undecided', label: 'अभी तय नहीं है' },
];

export const CLARIFICATION_QUESTION =
  'क्या आप सिर्फ अपने Accounts संभालेंगे, या दूसरों के भी?';
export const CLARIFICATION_OPTIONS: readonly OptionDef[] = [
  { id: 'ownOnly', label: 'सिर्फ अपने' },
  { id: 'mixed', label: 'दूसरों के भी' },
  { id: 'undecided', label: 'अभी तय नहीं है' },
];

export const FORCED_QUESTION =
  'चलिए, इसे साथ मिलकर तय करते हैं। SocialOps में आप किन Accounts को manage करेंगे?';
export const FORCED_OPTIONS: readonly OptionDef[] = [
  { id: 'CLIENT', label: 'सिर्फ मेरे अपने / मेरे बिज़नेस के अकाउंट्स' },
  { id: 'SERVICE_PROVIDER', label: 'दूसरों के अकाउंट्स भी (Clients / Individuals)' },
];

export const CONFIRMATION_MESSAGE =
  'समझ गया।\nअब आपका SocialOps account बनाते हैं।';
export const CONTINUE_OPTION: OptionDef = { id: 'continue', label: 'आगे बढ़ें' };

export const IDENTITY_QUESTION = 'आपको किस नाम से बुलाऊँ?';

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

export function createConversation(): ConversationState {
  return {
    stage: 'discovery-root',
    root: null,
    branch: null,
    ownBranch: null,
    mixedBranch: null,
    classification: null,
    clarificationAnswer: null,
    discoveryAccepted: false,
  };
}

/** Options currently on screen (selection-first UI; empty only for the identity form). */
export function optionsFor(state: ConversationState): readonly OptionDef[] {
  switch (state.stage) {
    case 'discovery-root':
      return ROOT_OPTIONS;
    case 'discovery-branch':
      return state.branch === 'own' ? OWN_OPTIONS : MIXED_OPTIONS;
    case 'clarification':
      return CLARIFICATION_OPTIONS;
    case 'forced-choice':
      return FORCED_OPTIONS;
    case 'confirmation':
      return [CONTINUE_OPTION];
    case 'identity':
      return [];
  }
}

/** Bot-side question/confirmation for the current stage. */
export function botMessageFor(state: ConversationState): string {
  switch (state.stage) {
    case 'discovery-root':
      return ROOT_QUESTION;
    case 'discovery-branch':
      return state.branch === 'own' ? OWN_QUESTION : MIXED_QUESTION;
    case 'clarification':
      return CLARIFICATION_QUESTION;
    case 'forced-choice':
      return FORCED_QUESTION;
    case 'confirmation':
      return CONFIRMATION_MESSAGE;
    case 'identity':
      return IDENTITY_QUESTION;
  }
}

function toConfirmation(
  state: ConversationState,
  classification: AccountType,
): ConversationState {
  // Discovery accepted only ever lands on confirmation with a definite
  // classification - never guessed, never null (L13).
  return { ...state, stage: 'confirmation', classification, discoveryAccepted: true };
}

/**
 * Apply the user's selection for the CURRENT stage. Unknown option ids
 * are ignored (same state returned) so a stray click can never force a
 * classification.
 */
export function selectOption(
  state: ConversationState,
  optionId: string,
): ConversationState {
  switch (state.stage) {
    case 'discovery-root': {
      if (optionId === 'own') {
        return { ...state, root: 'own', branch: 'own', stage: 'discovery-branch' };
      }
      if (optionId === 'mixed') {
        return { ...state, root: 'mixed', branch: 'mixed', stage: 'discovery-branch' };
      }
      if (optionId === 'undecided') {
        return { ...state, root: 'undecided', stage: 'clarification' };
      }
      return state;
    }
    case 'discovery-branch': {
      if (state.branch === 'own') {
        if (optionId === 'personal' || optionId === 'business' || optionId === 'both') {
          return toConfirmation({ ...state, ownBranch: optionId }, 'CLIENT');
        }
        if (optionId === 'undecided') {
          // Root already said "own"; the sub-question only refines
          // context - classification stays definite (no guessing).
          return toConfirmation({ ...state, ownBranch: 'undecided' }, 'CLIENT');
        }
        return state;
      }
      if (
        optionId === 'clients' ||
        optionId === 'individuals' ||
        optionId === 'both'
      ) {
        return toConfirmation({ ...state, mixedBranch: optionId }, 'SERVICE_PROVIDER');
      }
      if (optionId === 'undecided') {
        return toConfirmation({ ...state, mixedBranch: 'undecided' }, 'SERVICE_PROVIDER');
      }
      return state;
    }
    case 'clarification': {
      if (optionId === 'ownOnly') {
        return toConfirmation({ ...state, clarificationAnswer: 'ownOnly' }, 'CLIENT');
      }
      if (optionId === 'mixed') {
        return toConfirmation(
          { ...state, clarificationAnswer: 'mixed' },
          'SERVICE_PROVIDER',
        );
      }
      if (optionId === 'undecided') {
        // Still unclear -> forced choice; NEVER guessed (L13).
        return { ...state, clarificationAnswer: 'undecided', stage: 'forced-choice' };
      }
      return state;
    }
    case 'forced-choice': {
      if (optionId === 'CLIENT' || optionId === 'SERVICE_PROVIDER') {
        return toConfirmation(state, optionId);
      }
      return state;
    }
    case 'confirmation': {
      if (optionId === CONTINUE_OPTION.id) {
        return { ...state, stage: 'identity' };
      }
      return state;
    }
    case 'identity':
      return state;
  }
}

/**
 * JSON snapshot of the accepted discovery conversation (L8). Stored
 * verbatim on PendingRegistration; never re-asked afterwards. The
 * authoritative accountType is sent separately and must be non-null by
 * the time Account Creation happens (L13).
 */
export function discoveryAnswersSnapshot(
  state: ConversationState,
): DiscoveryAnswers {
  return {
    root: state.root,
    ownBranch: state.ownBranch,
    mixedBranch: state.mixedBranch,
    clarificationAnswer: state.clarificationAnswer,
    classification: state.classification,
    discoveryAccepted: state.discoveryAccepted,
  };
}
