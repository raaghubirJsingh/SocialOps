import {
  CONFIRMATION_MESSAGE,
  CONTINUE_OPTION,
  botMessageFor,
  createConversation,
  discoveryAnswersSnapshot,
  optionsFor,
  selectOption,
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
      expect(s.stage).toBe('identity');
      expect(s.discoveryAccepted).toBe(true);
    });
  });

  describe('no re-ask / never-guess invariants', () => {
    it('never returns to an earlier stage once advanced', () => {
      let s = createConversation();
      s = pick(s, 1);
      s = pick(s, 0);
      s = pick(s, 0); // continue
      expect(selectOption(s, 'own').stage).toBe('identity');
      expect(selectOption(s, 'undecided').stage).toBe('identity');
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
        expect(final.stage).toBe('identity');
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
