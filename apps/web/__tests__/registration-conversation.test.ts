import {
  CONFIRMATION_MESSAGE,
  CONTINUE_OPTION,
  EMAIL_QUESTION,
  IDENTITY_QUESTION,
  PHONE_QUESTION,
  botMessageFor,
  createConversation,
  discoveryAnswersSnapshot,
  identityFieldFor,
  optionsFor,
  selectOption,
  submitIdentityField,
  type ConversationState,
} from '@/lib/registration-conversation';

function pick(state: ConversationState, index: number): ConversationState {
  const opts = optionsFor(state);
  const opt = opts[index];
  if (!opt) throw new Error(`no option at index ${index} for ${state.stage}`);
  return selectOption(state, opt.id);
}

describe('registration conversation state machine (Registration Phase v1.0)', () => {
  describe('discovery classification rules', () => {
    it('own only -> CLIENT (personal / business / both)', () => {
      for (const optionIndex of [0, 1, 2]) {
        let s = createConversation();
        s = pick(s, 0); // अपने Accounts
        expect(s.stage).toBe('discovery-branch');
        s = pick(s, optionIndex);
        expect(s.stage).toBe('confirmation');
        expect(s.classification).toBe('CLIENT');
        expect(s.discoveryAccepted).toBe(true);
      }
    });

    it('own + others (mixed root) -> SERVICE_PROVIDER (clients / individuals / both)', () => {
      for (const optionIndex of [0, 1, 2]) {
        let s = createConversation();
        s = pick(s, 1); // अपने और दूसरों के
        s = pick(s, optionIndex);
        expect(s.stage).toBe('confirmation');
        expect(s.classification).toBe('SERVICE_PROVIDER');
      }
    });

    it('others-only path (mixed root, clients/individuals) -> SERVICE_PROVIDER', () => {
      let s = createConversation();
      s = pick(s, 1);
      s = pick(s, 0); // Clients / Businesses के
      expect(s.classification).toBe('SERVICE_PROVIDER');
    });

    it("root undecided -> minimum clarification; 'सिर्फ अपने' -> CLIENT", () => {
      let s = createConversation();
      s = pick(s, 2); // अभी तय नहीं है
      expect(s.stage).toBe('clarification');
      expect(s.classification).toBeNull();
      s = pick(s, 0); // सिर्फ अपने
      expect(s.stage).toBe('confirmation');
      expect(s.classification).toBe('CLIENT');
    });

    it("clarification 'दूसरों के भी' -> SERVICE_PROVIDER", () => {
      let s = createConversation();
      s = pick(s, 2);
      s = pick(s, 1);
      expect(s.classification).toBe('SERVICE_PROVIDER');
    });

    it('still unresolved -> forced choice; NEVER guessed; explicit pick required', () => {
      let s = createConversation();
      s = pick(s, 2); // root undecided
      s = pick(s, 2); // clarification undecided
      expect(s.stage).toBe('forced-choice');
      s = selectOption(s, 'nope');
      expect(s.stage).toBe('forced-choice');
      expect(s.classification).toBeNull();
      s = selectOption(s, 'SERVICE_PROVIDER');
      expect(s.stage).toBe('confirmation');
      expect(s.classification).toBe('SERVICE_PROVIDER');
    });

    it('own-branch undecided still classifies from the root answer (no guessing needed)', () => {
      let s = createConversation();
      s = pick(s, 0); // own root
      s = pick(s, 3); // sub-question अभी तय नहीं है
      expect(s.stage).toBe('confirmation');
      expect(s.classification).toBe('CLIENT');
    });
  });


  describe('field-by-field identity wizard (Rule 7)', () => {
    /** Reach the wizard through an accepted discovery path. */
    function atWizard(): ConversationState {
      let s = createConversation();
      s = pick(s, 0); // अपने Accounts
      s = pick(s, 0); // मेरे Personal Accounts -> CLIENT
      return selectOption(s, 'continue');
    }

    it('[आगे बढ़ें] opens the wizard on the NAME step only', () => {
      const s = atWizard();
      expect(s.stage).toBe('identity-name');
      expect(identityFieldFor(s.stage)).toBe('fullName');
      // The phone and email inputs must not exist yet.
      expect(identityFieldFor('identity-phone')).toBe('phone');
      expect(s.phone).toBeNull();
      expect(s.email).toBeNull();
    });

    it('asks exactly one field per step, in the approved order', () => {
      let s = atWizard();
      expect(botMessageFor(s)).toBe(IDENTITY_QUESTION);

      s = submitIdentityField(s, 'टेस्ट यूज़र');
      expect(s.stage).toBe('identity-phone');
      expect(s.fullName).toBe('टेस्ट यूज़र');
      expect(botMessageFor(s)).toBe(PHONE_QUESTION);

      s = submitIdentityField(s, '9876543210');
      expect(s.stage).toBe('identity-email');
      expect(s.phone).toBe('9876543210');
      expect(botMessageFor(s)).toBe(EMAIL_QUESTION);

      s = submitIdentityField(s, 'user@example.com');
      expect(s.stage).toBe('identity'); // terminal
      expect(s.email).toBe('user@example.com');
    });

    it('rejects a blank or whitespace-only value without advancing', () => {
      for (const blank of ['', '   ', '\t\n']) {
        const s = atWizard();
        const after = submitIdentityField(s, blank);
        expect(after.stage).toBe('identity-name');
        expect(after.fullName).toBeNull();
        expect(after).toBe(s); // same reference: no partial mutation
      }
    });

    it('trims the stored value so /start receives clean input', () => {
      let s = atWizard();
      s = submitIdentityField(s, '  टेस्ट यूज़र  ');
      expect(s.fullName).toBe('टेस्ट यूज़र');
    });

    it('never re-asks a field and never regresses to an earlier step', () => {
      let s = atWizard();
      s = submitIdentityField(s, 'टेस्ट यूज़र');
      s = submitIdentityField(s, '9876543210');
      s = submitIdentityField(s, 'user@example.com');
      expect(s.stage).toBe('identity');

      // Further input at the terminal stage is ignored entirely.
      const after = submitIdentityField(s, 'ignored@example.com');
      expect(after.stage).toBe('identity');
      expect(after.email).toBe('user@example.com');

      // Options never apply inside the wizard.
      expect(selectOption(s, 'own').stage).toBe('identity');
      expect(optionsFor(s)).toEqual([]);
    });

    it('ignores identity input submitted from a non-wizard stage', () => {
      // discovery-root
      const root = createConversation();
      expect(submitIdentityField(root, 'नाम').stage).toBe('discovery-root');
      expect(root.fullName).toBeNull();

      // confirmation (discovery accepted, wizard not opened yet)
      const confirmed = pick(pick(createConversation(), 0), 0);
      expect(confirmed.stage).toBe('confirmation');
      expect(submitIdentityField(confirmed, 'नाम').stage).toBe('confirmation');
      expect(confirmed.fullName).toBeNull();
    });

    it('offers no option buttons for any identity step', () => {
      let s = atWizard();
      expect(optionsFor(s)).toEqual([]);
      s = submitIdentityField(s, 'नाम');
      expect(optionsFor(s)).toEqual([]);
      s = submitIdentityField(s, '9876543210');
      expect(optionsFor(s)).toEqual([]);
      s = submitIdentityField(s, 'user@example.com');
      expect(optionsFor(s)).toEqual([]);
    });

    it('keeps identity fields OUT of the discoveryAnswers snapshot (L8)', () => {
      let s = atWizard();
      s = submitIdentityField(s, 'टेस्ट यूज़र');
      s = submitIdentityField(s, '9876543210');
      s = submitIdentityField(s, 'user@example.com');

      const snapshot = discoveryAnswersSnapshot(s);
      // The backend DTO is strict; identity is sent as separate top-level
      // fields to /start and must never be duplicated into the snapshot.
      expect(snapshot).toEqual({
        root: 'own',
        ownBranch: 'personal',
        mixedBranch: null,
        clarificationAnswer: null,
        classification: 'CLIENT',
        discoveryAccepted: true,
      });
      expect(Object.keys(snapshot)).not.toContain('fullName');
      expect(Object.keys(snapshot)).not.toContain('phone');
      expect(Object.keys(snapshot)).not.toContain('email');
      expect(JSON.stringify(snapshot)).not.toContain('user@example.com');
    });

    it('identityFieldFor returns null outside the wizard', () => {
      expect(identityFieldFor('discovery-root')).toBeNull();
      expect(identityFieldFor('confirmation')).toBeNull();
      expect(identityFieldFor('forced-choice')).toBeNull();
      expect(identityFieldFor('identity')).toBeNull();
    });
  });

  describe('approved copy and options', () => {
    it('root stage shows the exact approved question with exactly 3 options', () => {
      const s = createConversation();
      expect(botMessageFor(s)).toBe(
        'आप SocialOps में किन Accounts को manage करना चाहते हैं?',
      );
      expect(optionsFor(s).map((o) => o.label)).toEqual([
        'अपने Accounts',
        'अपने और दूसरों के Accounts',
        'अभी तय नहीं है',
      ]);
    });

    it('confirmation shows the exact approved copy and [आगे बढ़ें]', () => {
      let s = createConversation();
      s = pick(s, 0);
      s = pick(s, 0);
      expect(botMessageFor(s)).toBe(CONFIRMATION_MESSAGE);
      expect(optionsFor(s)).toEqual([CONTINUE_OPTION]);
      expect(CONTINUE_OPTION.label).toBe('आगे बढ़ें');
    });

    it('continues to identity only via [आगे बढ़ें]', () => {
      let s = createConversation();
      s = pick(s, 0);
      s = pick(s, 0);
      s = selectOption(s, 'own'); // wrong-stage option ignored
      expect(s.stage).toBe('confirmation');
      s = selectOption(s, 'continue');
      // Rule 7: continue opens the wizard at the NAME step.
      expect(s.stage).toBe('identity-name');
      expect(s.discoveryAccepted).toBe(true);
    });
  });

  describe('no re-ask / never-guess invariants', () => {
    it('never returns to an earlier stage once advanced', () => {
      let s = createConversation();
      s = pick(s, 1);
      s = pick(s, 0);
      s = pick(s, 0); // continue
      expect(selectOption(s, 'own').stage).toBe('identity-name');
      expect(selectOption(s, 'undecided').stage).toBe('identity-name');
      expect(s.classification).toBe('SERVICE_PROVIDER');
    });

    it('classification is always definite once discovery is accepted', () => {
      const paths: Array<(s: ConversationState) => ConversationState> = [
        (s) => selectOption(pick(pick(s, 0), 0), 'continue'),
        (s) => selectOption(pick(pick(s, 1), 3), 'continue'),
        (s) => selectOption(selectOption(pick(pick(s, 2), 2), 'CLIENT'), 'continue'),
      ];
      for (const run of paths) {
        const final = run(createConversation());
        expect(final.stage).toBe('identity-name');
        expect(final.classification).not.toBeNull();
        expect(final.discoveryAccepted).toBe(true);
      }
    });
  });

  describe('discoveryAnswers snapshot (L8)', () => {
    it('captures the conversation context as JSON-serializable data', () => {
      let s = createConversation();
      s = pick(s, 1); // mixed
      s = pick(s, 0); // clients
      s = selectOption(s, 'continue');
      const snapshot = discoveryAnswersSnapshot(s);
      expect(snapshot).toEqual({
        root: 'mixed',
        ownBranch: null,
        mixedBranch: 'clients',
        clarificationAnswer: null,
        classification: 'SERVICE_PROVIDER',
        discoveryAccepted: true,
      });
      expect(() => JSON.stringify(snapshot)).not.toThrow();
    });
  });
});
