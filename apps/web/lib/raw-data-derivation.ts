/**
 * P1 - Rules-only derivation for the simplified (text-first) request flow.
 *
 * SCOPE / BOUNDARIES (approved P1 plan)
 * - Rules-only: deterministic TypeScript over the EXISTING master lists in
 *   `@/types/raw-data`. No network call, no LLM, no new dependency, no new
 *   backend endpoint, no schema/contract change.
 * - No fabrication: a field is emitted only when the story text actually
 *   supports it. Absent evidence leaves the field UNSET (omitted from
 *   `metadata`), never guessed. Dates, prices, venues, contact details and
 *   names are never invented.
 * - Metadata keys are EXISTING RawData metadata keys. No key is invented,
 *   renamed or deleted (legacy wizard keys and structures stay untouched).
 *
 * PROVISIONAL UX BEHAVIOR - NOT A BUSINESS POLICY
 * --------------------------------------------------------------------------
 * Everything in the `PROVISIONAL_*` block below (which keys may be asked
 * about, in what order, how many question groups are shown by default, and
 * the input length bounds) is PROVISIONAL UX BEHAVIOR ONLY.
 *
 * It is deliberately:
 *   - explicitly provisional and plainly marked as replaceable;
 *   - NOT a business-required question policy - nothing here may be promoted
 *     into backend validation, the API contract, or the data model;
 *   - replaceable without touching the API contract, the data model, or the
 *     storage shape.
 *
 * D6 (materiality framing) and D9 (low-confidence surfacing / question
 * policy) are the FORMAL refinement gates for P2 and will replace this
 * block. P1 must not hard-code a permanent question policy.
 */

import {
  AGE_GROUPS,
  CONTENT_CATEGORIES,
  CONTENT_PURPOSES,
  CONTENT_TYPES,
  CTA_OPTIONS,
  CUSTOMER_TYPES,
  LANGUAGES,
  PLATFORMS,
  TARGET_AUDIENCES,
  TONES,
} from '@/types/raw-data';

/** Confidence attached to a derived value. */
export type DerivationConfidence = 'high' | 'medium' | 'low';

/**
 * Existing RawData metadata keys this engine may emit. Every entry already
 * exists in the legacy wizard schema (`@/types/raw-data`), so the submitted
 * `metadata` payload keeps exactly the same key vocabulary as today.
 */
export type RawDataMetadataKey =
  | 'contentPurpose'
  | 'contentCategory'
  | 'contentType'
  | 'platform'
  | 'priority'
  | 'targetAudience'
  | 'ageGroup'
  | 'gender'
  | 'customerType'
  | 'language'
  | 'tone'
  | 'writingStyle'
  | 'creativeStyle'
  | 'topic'
  | 'cta'
  | 'campaignOccasion'
  | 'referenceLinkUrls';

export interface FieldMeta {
  key: RawDataMetadataKey;
  label: string;
  kind: 'single' | 'multi';
  options?: readonly string[];
}


/** Display/edit metadata per key (labels are PROPOSED UX draft copy). */
export const FIELD_META: readonly FieldMeta[] = [
  { key: 'platform', label: 'Platform(s)', kind: 'multi', options: PLATFORMS },
  { key: 'contentType', label: 'Content type', kind: 'single', options: CONTENT_TYPES },
  { key: 'contentPurpose', label: 'Purpose', kind: 'single', options: CONTENT_PURPOSES },
  { key: 'contentCategory', label: 'Category', kind: 'single', options: CONTENT_CATEGORIES },
  { key: 'targetAudience', label: 'Audience', kind: 'multi', options: TARGET_AUDIENCES },
  { key: 'customerType', label: 'Customer type', kind: 'multi', options: CUSTOMER_TYPES },
  { key: 'ageGroup', label: 'Age group', kind: 'multi', options: AGE_GROUPS },
  {
    key: 'gender',
    label: 'Gender focus',
    kind: 'single',
    options: ['All', 'Male', 'Female', 'Other'],
  },
  { key: 'language', label: 'Language', kind: 'multi', options: LANGUAGES },
  { key: 'tone', label: 'Tone', kind: 'single', options: TONES },
  { key: 'writingStyle', label: 'Writing style', kind: 'single' },
  { key: 'creativeStyle', label: 'Creative style', kind: 'single' },
  { key: 'cta', label: 'Call to action', kind: 'single', options: CTA_OPTIONS },
  { key: 'campaignOccasion', label: 'Occasion', kind: 'single' },
  {
    key: 'priority',
    label: 'Priority',
    kind: 'single',
    options: ['Normal', 'Important', 'Urgent'],
  },
  { key: 'topic', label: 'Topic', kind: 'single' },
  { key: 'referenceLinkUrls', label: 'Reference links', kind: 'single' },
];

const FIELD_META_BY_KEY: Readonly<Record<string, FieldMeta>> = Object.fromEntries(
  FIELD_META.map((meta) => [meta.key, meta]),
);

/**
 * PROVISIONAL UX DEFAULTS (replaceable in P2 by D6/D9 - see the file header).
 */
export const PROVISIONAL_STORY_MIN_LENGTH = 1;
export const PROVISIONAL_STORY_MAX_LENGTH = 5000;

/**
 * Default cap on how many question groups Screen 2 shows. This is a display
 * default ONLY: it is not a validation rule, not an API constraint, not a
 * business rule, and it is not asserted as a domain invariant in tests (tests
 * follow the constant, so a D6/D9 change cannot break them).
 */
export const PROVISIONAL_QUESTION_GROUP_LIMIT = 5;

export interface ProvisionalAskEntry {
  key: RawDataMetadataKey;
  /** Why the flow may ask. PROVISIONAL reasoning, replaced by D6 in P2. */
  reason: string;
}

/**
 * PROVISIONAL order in which gaps may be asked about. The order is provisional
 * UX behaviour, not an approved materiality policy (D6 decides that in P2).
 */
export const PROVISIONAL_ASK_POLICY: readonly ProvisionalAskEntry[] = [
  { key: 'platform', reason: 'Where the content should go is needed to plan the work.' },
  { key: 'contentType', reason: 'The format changes what the team produces.' },
  { key: 'contentPurpose', reason: 'The goal shapes the copy.' },
  { key: 'targetAudience', reason: 'Who it speaks to changes the wording.' },
  { key: 'language', reason: 'Language determines who can produce it.' },
  { key: 'tone', reason: 'Tone is a common client preference.' },
  { key: 'contentCategory', reason: 'Category helps the team file and reuse it.' },
];

export interface DerivedField {
  key: RawDataMetadataKey;
  label: string;
  kind: 'single' | 'multi';
  options?: readonly string[];
  /** Normalised value(s). Multi-valued keys carry an array. */
  value: string | string[];
  confidence: DerivationConfidence;
  /** The matched wording from the story, shown so Screen 2 is transparent. */
  evidence: string[];
}

export interface DerivationQuestion {
  key: RawDataMetadataKey;
  label: string;
  kind: 'single' | 'multi';
  options?: readonly string[];
  /** PROVISIONAL draft wording for the clarification prompt (D10 copy). */
  prompt: string;
  reason: string;
  /** Present when a low-confidence value was detected but not trusted. */
  suggestedValue?: string | string[];
}

export interface DerivationResult {
  /** The single free-text input, trimmed. Always sent as `extractedText`. */
  story: string;
  /** High confidence: shown as understood, nothing is asked. */
  understood: DerivedField[];
  /** Medium confidence: flagged "please check" and editable. */
  toCheck: DerivedField[];
  /** Low confidence or missing-but-askable, capped by the provisional limit. */
  questions: DerivationQuestion[];
  /** Current values keyed by EXISTING metadata key (empty values omitted). */
  values: Record<string, string | string[]>;
}

/* -------------------------------------------------------------------------
 * Matching helpers (deterministic; no fuzzy-match library, no new dependency)
 * ---------------------------------------------------------------------- */

/** Escape a literal term for use inside a RegExp. */
function escapeTerm(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whole-word-ish match that also accepts a simple plural ("offer"/"offers"). */
function hasTerm(haystack: string, term: string): boolean {
  const pattern = new RegExp(`(^|[^a-z0-9])${escapeTerm(term)}(s|es)?([^a-z0-9]|$)`);
  return pattern.test(haystack);
}

function normaliseStory(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ');
}

interface TermRule {
  value: string;
  terms: readonly string[];
  confidence: DerivationConfidence;
}

interface RuleSet {
  key: RawDataMetadataKey;
  rules: readonly TermRule[];
}

/* -------------------------------------------------------------------------
 * Rule tables - keyword heuristics over the existing master lists.
 * A single-choice rule set must produce exactly one confident winner; ties and
 * weak terms degrade to a question (low confidence) so the CLIENT decides
 * rather than the engine guessing.
 * ---------------------------------------------------------------------- */

const SINGLE_CONTENT_TYPE: RuleSet = {
  key: 'contentType',
  rules: [
    { value: 'Short Video', terms: ['short video', 'shorts', 'youtube short'], confidence: 'high' },
    { value: 'Long Video', terms: ['long video', 'youtube video', 'full video'], confidence: 'high' },
    { value: 'Reel', terms: ['reel', 'reels'], confidence: 'high' },
    { value: 'Carousel', terms: ['carousel', 'swipe post'], confidence: 'high' },
    { value: 'Poster', terms: ['poster', 'flyer'], confidence: 'high' },
    { value: 'Infographic', terms: ['infographic'], confidence: 'high' },
    { value: 'Article/Blog', terms: ['article', 'blog post', 'blogpost'], confidence: 'high' },
    { value: 'Advertisement', terms: ['advertisement', 'advert', 'paid ad', 'ad campaign'], confidence: 'high' },
    { value: 'Social Post', terms: ['social post', 'social media post', 'feed post'], confidence: 'high' },
    { value: 'Story', terms: ['story', 'stories'], confidence: 'low' },
  ],
};

const SINGLE_PURPOSE: RuleSet = {
  key: 'contentPurpose',
  rules: [
    { value: 'Event', terms: ['event', 'webinar', 'workshop', 'seminar', 'expo', 'summit'], confidence: 'high' },
    { value: 'Recruitment', terms: ['hiring', 'vacancy', 'job opening', 'recruitment'], confidence: 'high' },
    { value: 'Promotion', terms: ['offer', 'discount', 'sale', 'deal', 'promotion'], confidence: 'high' },
    { value: 'Announcement', terms: ['announcement', 'announce', 'introducing', 'unveil'], confidence: 'high' },
    { value: 'Education', terms: ['educational', 'tips', 'how to', 'guide'], confidence: 'high' },
    { value: 'Engagement', terms: ['engagement', 'contest', 'giveaway', 'poll', 'quiz'], confidence: 'high' },
    { value: 'Lead Generation', terms: ['lead generation', 'enquiry', 'inquiry', 'demo'], confidence: 'high' },
    { value: 'Awareness', terms: ['awareness'], confidence: 'high' },
    { value: 'Product/Service Information', terms: ['product information', 'service information', 'product details'], confidence: 'high' },
    { value: 'Customer Information', terms: ['customer information', 'advisory'], confidence: 'high' },
  ],
};

const SINGLE_CATEGORY: RuleSet = {
  key: 'contentCategory',
  rules: [
    { value: 'Festival/Occasion', terms: ['festival', 'diwali', 'holi', 'christmas', 'eid', 'navratri', 'new year'], confidence: 'high' },
    { value: 'Event', terms: ['event', 'webinar', 'workshop', 'seminar', 'expo'], confidence: 'high' },
    { value: 'Offer', terms: ['offer', 'discount', 'sale', 'deal'], confidence: 'high' },
    { value: 'Product', terms: ['product', 'launch'], confidence: 'high' },
    { value: 'Service', terms: ['service', 'consultation', 'appointment', 'booking'], confidence: 'high' },
    { value: 'Testimonial', terms: ['testimonial', 'customer story', 'customer review', 'feedback'], confidence: 'high' },
    { value: 'Recruitment', terms: ['hiring', 'vacancy', 'job opening', 'recruitment'], confidence: 'high' },
    { value: 'Educational', terms: ['educational', 'how to', 'guide'], confidence: 'high' },
    { value: 'Corporate', terms: ['corporate', 'annual report', 'company update'], confidence: 'high' },
    { value: 'Community', terms: ['community', 'social cause', 'csr', 'ngo'], confidence: 'high' },
  ],
};


const SINGLE_TONE: RuleSet = {
  key: 'tone',
  rules: [
    { value: 'Festive', terms: ['festive', 'festival'], confidence: 'high' },
    { value: 'Professional', terms: ['professional'], confidence: 'high' },
    { value: 'Promotional', terms: ['promotional'], confidence: 'high' },
    { value: 'Educational', terms: ['educational'], confidence: 'high' },
    { value: 'Emotional', terms: ['emotional', 'heartfelt'], confidence: 'high' },
    { value: 'Inspirational', terms: ['inspirational', 'motivational'], confidence: 'high' },
    { value: 'Conversational', terms: ['conversational', 'friendly'], confidence: 'high' },
    { value: 'Formal', terms: ['formal', 'official'], confidence: 'high' },
    { value: 'Urgent', terms: ['urgent', 'asap'], confidence: 'high' },
    { value: 'Humorous', terms: ['humorous', 'funny', 'light hearted'], confidence: 'high' },
    { value: 'Informative', terms: ['informative'], confidence: 'high' },
  ],
};

const SINGLE_WRITING_STYLE: RuleSet = {
  key: 'writingStyle',
  rules: [
    { value: 'Short & Crisp', terms: ['short and crisp', 'short crisp', 'crisp', 'concise'], confidence: 'high' },
    { value: 'Detailed', terms: ['detailed', 'in detail'], confidence: 'high' },
    { value: 'News Style', terms: ['news style'], confidence: 'high' },
    { value: 'Storytelling', terms: ['storytelling', 'story telling', 'narrative'], confidence: 'high' },
    { value: 'Question/Answer', terms: ['question and answer', 'q and a'], confidence: 'high' },
    { value: 'Call-to-Action Focused', terms: ['call to action focused', 'cta focused'], confidence: 'high' },
  ],
};

const SINGLE_CREATIVE_STYLE: RuleSet = {
  key: 'creativeStyle',
  rules: [
    { value: 'Clean', terms: ['clean design', 'clean look'], confidence: 'high' },
    { value: 'Corporate', terms: ['corporate'], confidence: 'high' },
    { value: 'Modern', terms: ['modern'], confidence: 'high' },
    { value: 'Minimal', terms: ['minimal', 'minimalistic'], confidence: 'high' },
    { value: 'Bold', terms: ['bold'], confidence: 'high' },
    { value: 'Traditional', terms: ['traditional'], confidence: 'high' },
    { value: 'Festive', terms: ['festive'], confidence: 'high' },
    { value: 'News/Editorial', terms: ['editorial'], confidence: 'high' },
    { value: 'Premium', terms: ['premium', 'luxury'], confidence: 'high' },
    { value: 'Youth-oriented', terms: ['youth oriented', 'youthful'], confidence: 'high' },
  ],
};

const SINGLE_GENDER: RuleSet = {
  key: 'gender',
  rules: [
    { value: 'Female', terms: ['female', 'for women', 'women only'], confidence: 'high' },
    { value: 'Male', terms: ['male', 'for men', 'men only'], confidence: 'high' },
    { value: 'All', terms: ['all genders', 'unisex'], confidence: 'high' },
  ],
};

const SINGLE_CTA: RuleSet = {
  key: 'cta',
  rules: [
    { value: 'Call Now', terms: ['call now', 'call us'], confidence: 'high' },
    { value: 'Book Now', terms: ['book now', 'book an appointment'], confidence: 'high' },
    { value: 'Buy Now', terms: ['buy now', 'order now', 'shop now'], confidence: 'high' },
    { value: 'Register Now', terms: ['register', 'sign up'], confidence: 'high' },
    { value: 'Learn More', terms: ['learn more', 'know more'], confidence: 'high' },
    { value: 'Contact Us', terms: ['contact us', 'get in touch', 'reach out'], confidence: 'high' },
    { value: 'Visit Website', terms: ['visit website'], confidence: 'high' },
    { value: 'Visit Store', terms: ['visit store', 'store visit'], confidence: 'high' },
    { value: 'Download', terms: ['download'], confidence: 'high' },
    { value: 'Apply Now', terms: ['apply now'], confidence: 'high' },
    { value: 'Subscribe', terms: ['subscribe'], confidence: 'high' },
    { value: 'Follow Us', terms: ['follow us'], confidence: 'high' },
    { value: 'Share', terms: ['share this'], confidence: 'high' },
    { value: 'Send Message', terms: ['send message', 'message us', 'dm us'], confidence: 'high' },
  ],
};

const SINGLE_PRIORITY: RuleSet = {
  key: 'priority',
  rules: [
    { value: 'Urgent', terms: ['urgent', 'asap', 'immediately'], confidence: 'high' },
    { value: 'Important', terms: ['important', 'high priority'], confidence: 'medium' },
  ],
};

/** Festival / occasion vocabulary - explicit words only, never inferred. */
const OCCASION_TERMS: readonly { value: string; terms: readonly string[] }[] = [
  { value: 'Diwali', terms: ['diwali', 'deepavali'] },
  { value: 'Holi', terms: ['holi'] },
  { value: 'Christmas', terms: ['christmas', 'xmas'] },
  { value: 'Eid', terms: ['eid', 'ramzan', 'ramadan'] },
  { value: 'Navratri', terms: ['navratri'] },
  { value: 'Dussehra', terms: ['dussehra', 'dasara'] },
  { value: 'Raksha Bandhan', terms: ['rakhi', 'raksha bandhan'] },
  { value: 'New Year', terms: ['new year'] },
  { value: 'Independence Day', terms: ['independence day', '15 august'] },
  { value: 'Republic Day', terms: ['republic day', '26 january'] },
  { value: "Valentine's Day", terms: ['valentine'] },
  { value: 'Baisakhi', terms: ['baisakhi', 'vaisakhi'] },
  { value: 'Lohri', terms: ['lohri'] },
  { value: 'Onam', terms: ['onam'] },
  { value: 'Pongal', terms: ['pongal'] },
];


const MULTI_PLATFORM: RuleSet = {
  key: 'platform',
  rules: [
    { value: 'Instagram', terms: ['instagram', 'insta'], confidence: 'high' },
    { value: 'Facebook', terms: ['facebook'], confidence: 'high' },
    { value: 'YouTube', terms: ['youtube'], confidence: 'high' },
    { value: 'Website', terms: ['website', 'our site', 'landing page'], confidence: 'high' },
  ],
};

const MULTI_AUDIENCE: RuleSet = {
  key: 'targetAudience',
  rules: [
    { value: 'Students', terms: ['students', 'college'], confidence: 'high' },
    { value: 'Parents', terms: ['parents', 'mothers', 'fathers'], confidence: 'high' },
    { value: 'Youth', terms: ['youth', 'young people', 'youngsters'], confidence: 'high' },
    { value: 'Professionals', terms: ['professionals'], confidence: 'high' },
    { value: 'Business Owners', terms: ['business owners', 'shop owners', 'entrepreneurs'], confidence: 'high' },
    { value: 'Farmers', terms: ['farmers', 'kisan'], confidence: 'high' },
    { value: 'Women', terms: ['women', 'girls', 'ladies'], confidence: 'high' },
    { value: 'Senior Citizens', terms: ['senior citizens', 'seniors', 'elderly'], confidence: 'high' },
    { value: 'Employees', terms: ['employees', 'staff', 'team members'], confidence: 'high' },
    { value: 'Local Community', terms: ['local community', 'locals'], confidence: 'high' },
    { value: 'Potential Customers', terms: ['potential customers', 'new customers', 'prospects'], confidence: 'high' },
    { value: 'Existing Customers', terms: ['existing customers', 'loyal customers'], confidence: 'high' },
    { value: 'General Public', terms: ['general public', 'everyone'], confidence: 'medium' },
  ],
};

const MULTI_CUSTOMER_TYPE: RuleSet = {
  key: 'customerType',
  rules: [
    { value: 'Students', terms: ['students', 'college'], confidence: 'high' },
    { value: 'Families', terms: ['families'], confidence: 'high' },
    { value: 'Professionals', terms: ['professionals'], confidence: 'high' },
    { value: 'Business Buyers', terms: ['business buyers', 'b2b', 'wholesale'], confidence: 'high' },
    { value: 'Local Community', terms: ['local community', 'locals'], confidence: 'high' },
    { value: 'Existing Customers', terms: ['existing customers', 'loyal customers'], confidence: 'high' },
    { value: 'Potential Customers', terms: ['potential customers', 'new customers'], confidence: 'high' },
  ],
};

const MULTI_AGE_GROUP: RuleSet = {
  key: 'ageGroup',
  rules: [
    { value: 'Children', terms: ['children', 'kids'], confidence: 'high' },
    { value: 'Teenagers', terms: ['teenagers', 'teens'], confidence: 'high' },
    { value: 'All Ages', terms: ['all ages'], confidence: 'high' },
  ],
};

const MULTI_LANGUAGE: RuleSet = {
  key: 'language',
  rules: [
    { value: 'Hindi', terms: ['hindi'], confidence: 'high' },
    { value: 'English', terms: ['english'], confidence: 'high' },
    { value: 'Punjabi', terms: ['punjabi'], confidence: 'high' },
    { value: 'Hinglish', terms: ['hinglish'], confidence: 'high' },
  ],
};

const SINGLE_RULE_SETS: readonly RuleSet[] = [
  SINGLE_CONTENT_TYPE,
  SINGLE_PURPOSE,
  SINGLE_CATEGORY,
  SINGLE_TONE,
  SINGLE_WRITING_STYLE,
  SINGLE_CREATIVE_STYLE,
  SINGLE_GENDER,
  SINGLE_CTA,
  SINGLE_PRIORITY,
];

const MULTI_RULE_SETS: readonly RuleSet[] = [
  MULTI_PLATFORM,
  MULTI_AUDIENCE,
  MULTI_CUSTOMER_TYPE,
  MULTI_AGE_GROUP,
  MULTI_LANGUAGE,
];


/* -------------------------------------------------------------------------
 * Derivation engine
 * ---------------------------------------------------------------------- */

const CONFIDENCE_RANK: Readonly<Record<DerivationConfidence, number>> = {
  high: 3,
  medium: 2,
  low: 1,
};

interface RuleMatch {
  value: string;
  confidence: DerivationConfidence;
  evidence: string[];
}

function matchRules(normalised: string, ruleSet: RuleSet): RuleMatch[] {
  const matches: RuleMatch[] = [];
  for (const rule of ruleSet.rules) {
    const evidence = rule.terms.filter((term) => hasTerm(normalised, term));
    if (evidence.length > 0) {
      matches.push({ value: rule.value, confidence: rule.confidence, evidence });
    }
  }
  return matches;
}

/**
 * Single-choice derivation. Exactly one confident winner survives; a tie or a
 * weak-only match degrades to `low` confidence so Screen 2 asks the client
 * instead of the engine quietly picking.
 */
function deriveSingle(
  normalised: string,
  ruleSet: RuleSet,
): { value: string; confidence: DerivationConfidence; evidence: string[] } | null {
  const matches = matchRules(normalised, ruleSet);
  if (matches.length === 0) return null;

  const best = matches.reduce((winner, candidate) =>
    CONFIDENCE_RANK[candidate.confidence] > CONFIDENCE_RANK[winner.confidence]
      ? candidate
      : winner,
  );

  if (best.confidence === 'low') {
    return { value: best.value, confidence: 'low', evidence: best.evidence };
  }

  const sameRank = matches.filter((m) => m.confidence === best.confidence);
  if (sameRank.length > 1) {
    // Ambiguous: more than one equally plausible answer. Ask, do not guess.
    return {
      value: best.value,
      confidence: 'low',
      evidence: sameRank.flatMap((m) => m.evidence),
    };
  }

  return { value: best.value, confidence: best.confidence, evidence: best.evidence };
}

/**
 * Multi-choice derivation. Several matches are legitimate (e.g. two
 * platforms), so they are unioned; the confidence still drops to `medium`
 * when more than one rule matched, because the client should see the list.
 */
function deriveMulti(
  normalised: string,
  ruleSet: RuleSet,
): { value: string[]; confidence: DerivationConfidence; evidence: string[] } | null {
  const matches = matchRules(normalised, ruleSet);
  if (matches.length === 0) return null;

  const values = matches.map((m) => m.value);
  const evidence = matches.flatMap((m) => m.evidence);
  const strongest = matches.reduce((best, candidate) =>
    CONFIDENCE_RANK[candidate.confidence] > CONFIDENCE_RANK[best.confidence]
      ? candidate
      : best,
  ).confidence;

  if (strongest === 'low' || matches.length > 1) {
    return { value: values, confidence: 'medium', evidence };
  }
  return { value: values, confidence: strongest, evidence };
}

/** Age ranges written as digits (e.g. "18-24", "25 to 34") mapped to masters. */
function deriveAgeRanges(normalised: string): string[] {
  const found: string[] = [];
  const pattern = /\b(\d{2})\s*(?:-|–|to)\s*(\d{2})\b/g;
  let match = pattern.exec(normalised);
  while (match !== null) {
    const wanted = `${match[1]}-${match[2]}`;
    const master = AGE_GROUPS.find((option) => option.replace('–', '-') === wanted);
    if (master && !found.includes(master)) found.push(master);
    match = pattern.exec(normalised);
  }
  return found;
}

/** Explicit occasion words only; never inferred from tone or season. */
function deriveOccasion(
  normalised: string,
): { value: string; evidence: string[] } | null {
  for (const occasion of OCCASION_TERMS) {
    const evidence = occasion.terms.filter((term) => hasTerm(normalised, term));
    if (evidence.length > 0) return { value: occasion.value, evidence };
  }
  return null;
}

/** Links pasted into the story, kept as the EXISTING referenceLinkUrls key. */
function deriveReferenceLinks(story: string): string[] {
  const matches = story.match(/https?:\/\/[^\s<>")]+/gi);
  return matches ? Array.from(new Set(matches)) : [];
}

/**
 * Topic hint = the first sentence, trimmed. Medium confidence only: it is a
 * restatement of the client's own words, not an interpretation.
 */
function deriveTopic(story: string): { value: string; evidence: string[] } | null {
  const firstSentence = story.split(/[.!?\n]+/).map((part) => part.trim()).find((part) => part.length > 0);
  if (!firstSentence) return null;
  const words = firstSentence.split(/\s+/).filter((word) => word.length > 1);
  if (words.length < 3) return null;
  return { value: firstSentence.slice(0, 200), evidence: [] };
}

/**
 * PROVISIONAL draft wording for clarification prompts (D10 copy - finalized in
 * P5). Not a business policy; replaceable with the D6/D9 policy in P2.
 */
export const PROVISIONAL_ASK_PROMPTS: Readonly<Record<string, string>> = {
  platform: 'Where should this go?',
  contentType: 'What should we make?',
  contentPurpose: 'What is this mainly for?',
  targetAudience: 'Who is it for?',
  language: 'Which language should it be in?',
  tone: 'What tone should it have?',
  contentCategory: 'Which category fits best?',
};

/**
 * Build the PROVISIONAL clarification questions: low-confidence values are
 * asked about (with the suggestion offered, never pre-submitted), and
 * askable keys with no value at all are asked about. The list is capped by
 * PROVISIONAL_QUESTION_GROUP_LIMIT and ordered by PROVISIONAL_ASK_POLICY - a
 * provisional default, not an approved materiality policy (D6/D9 replace it).
 */
function buildQuestions(fields: readonly DerivedField[]): DerivationQuestion[] {
  const byKey = new Map<RawDataMetadataKey, DerivedField>(
    fields.map((field) => [field.key, field]),
  );
  const unsure: DerivationQuestion[] = [];
  const gaps: DerivationQuestion[] = [];

  for (const entry of PROVISIONAL_ASK_POLICY) {
    const meta = FIELD_META_BY_KEY[entry.key];
    if (!meta) continue;
    const field = byKey.get(entry.key);
    if (field && field.confidence !== 'low') continue;

    const question: DerivationQuestion = {
      key: entry.key,
      label: meta.label,
      kind: meta.kind,
      options: meta.options,
      prompt: PROVISIONAL_ASK_PROMPTS[entry.key] ?? `Tell us: ${meta.label}`,
      reason: entry.reason,
      suggestedValue: field ? field.value : undefined,
    };

    if (field) unsure.push(question);
    else gaps.push(question);
  }

  // Provisional ordering: first the things the client already mentioned but we
  // could not be sure about, then the things never mentioned at all.
  return [...unsure, ...gaps].slice(0, PROVISIONAL_QUESTION_GROUP_LIMIT);
}

/**
 * Derive structured values from ONE free-text story.
 *
 * Deterministic: the same story always produces the same result. Nothing is
 * invented - a value exists only when the story supports it. Low-confidence
 * values are returned as question suggestions and are deliberately NOT added
 * to `values`, so an ignored question never results in guessed data being
 * submitted.
 */
export function deriveRawDataFromStory(story: string): DerivationResult {
  const trimmed = story.trim();
  const normalised = normaliseStory(trimmed);
  const fields: DerivedField[] = [];
  const add = (field: DerivedField | null): void => {
    if (field) fields.push(field);
  };

  for (const ruleSet of SINGLE_RULE_SETS) {
    const match = deriveSingle(normalised, ruleSet);
    if (match) add(buildField(ruleSet.key, match.value, match.confidence, match.evidence));
  }

  for (const ruleSet of MULTI_RULE_SETS) {
    const match = deriveMulti(normalised, ruleSet);
    if (match) add(buildField(ruleSet.key, match.value, match.confidence, match.evidence));
  }

  const ranges = deriveAgeRanges(normalised);
  if (ranges.length > 0) {
    const existing = fields.find((field) => field.key === 'ageGroup');
    if (existing && Array.isArray(existing.value)) {
      existing.value = Array.from(new Set([...existing.value, ...ranges]));
    } else {
      add(buildField('ageGroup', ranges, 'high', []));
    }
  }

  const occasion = deriveOccasion(normalised);
  if (occasion) add(buildField('campaignOccasion', occasion.value, 'high', occasion.evidence));

  const topic = deriveTopic(trimmed);
  if (topic) add(buildField('topic', topic.value, 'medium', topic.evidence));

  const links = deriveReferenceLinks(trimmed);
  if (links.length > 0) add(buildField('referenceLinkUrls', links.join('\n'), 'high', []));

  const understood = fields.filter((field) => field.confidence === 'high');
  const toCheck = fields.filter((field) => field.confidence === 'medium');

  const values: Record<string, string | string[]> = {};
  for (const field of fields) {
    if (field.confidence === 'low') continue;
    values[field.key] = field.value;
  }

  return { story: trimmed, understood, toCheck, questions: buildQuestions(fields), values };
}

/** Render a field value for display (multi values joined for reading). */
export function describeFieldValue(value: string | string[] | undefined): string {
  if (value === undefined) return '';
  return Array.isArray(value) ? value.join(', ') : value;
}

function buildField(
  key: RawDataMetadataKey,
  value: string | string[],
  confidence: DerivationConfidence,
  evidence: string[],
): DerivedField | null {
  const meta = FIELD_META_BY_KEY[key];
  if (!meta) return null;
  const isEmpty = Array.isArray(value) ? value.length === 0 : value.trim().length === 0;
  if (isEmpty) return null;
  return { ...meta, value, confidence, evidence };
}
