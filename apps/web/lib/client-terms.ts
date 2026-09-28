/**
 * APPROVED Terms of Service & Data Agreement for the Client welcome gate.
 *
 * This copy is human-approved and must be reproduced VERBATIM. It is kept
 * in its own module so the legal text can be revised later by editing this
 * file alone - no component markup changes, and no risk of a partial
 * edit silently altering the wording a client is asked to accept.
 *
 * Sections 1 and 2 describe the data-usage grant and the content lifecycle;
 * Section 3 is the liability allocation. Do not paraphrase, summarise or
 * reorder - a client accepts exactly this text.
 */
export interface ClientTermsSection {
  id: string;
  heading: string;
  body: string;
}

export const CLIENT_TERMS_TITLE = 'Terms of Service & Data Agreement';

export const CLIENT_TERMS_SECTIONS: readonly ClientTermsSection[] = [
  {
    id: 'data-usage',
    heading: 'Section 1 — Data Usage & Strict Isolation',
    body:
      'All raw data, briefs, and reference materials submitted by the Client ' +
      'are utilized exclusively by your designated Service Provider and the ' +
      'SocialOps AI fleet for the sole purpose of drafting and structuring ' +
      'content. Upon submission, this raw data is converted into an immutable ' +
      'provenance record. SocialOps enforces strict tenant isolation at the ' +
      'server and database levels, ensuring your proprietary data is never ' +
      'exposed to unauthorized third parties or other agencies.',
  },
  {
    id: 'content-lifecycle',
    heading: 'Section 2 — Content Lifecycle & Final Confirmation',
    body:
      'The platform operates on a strict state-machine workflow. Clients are ' +
      'provided a structured review cycle to request modifications. Content is ' +
      'finalized only when the Client explicitly grants Final Confirmation, at ' +
      'which point the record becomes permanently locked and immutable.',
  },
  {
    id: 'limitation-of-liability',
    heading: 'Section 3 — Limitation of Liability & Content Responsibility',
    body:
      'SocialOps provides the software infrastructure for content operations ' +
      'and assumes absolutely no liability for the generated material. Because ' +
      'no content is finalized without the Client’s explicit Final ' +
      'Confirmation, the Client bears full and sole responsibility for the ' +
      'accuracy, legality, and compliance of all approved content.',
  },
] as const;

/** Label for the required acknowledgement checkbox. */
export const CLIENT_TERMS_ACKNOWLEDGEMENT =
  'I have read and agree to the Terms of Service & Data Agreement.';
