import { deriveClientType } from './client-persona.js';

/**
 * Persona derivation from the user's own discovery answers.
 *
 * The rule under test is deliberately narrow: ONLY an unambiguous answer
 * the user actually gave may become a ClientType. Everything else stays
 * null, because the persona is never guessed (AGENTS.md §17.1/§14).
 */
describe('deriveClientType', () => {
  it('maps an explicit personal/business answer', () => {
    expect(deriveClientType({ ownBranch: 'personal' })).toBe('INDIVIDUAL');
    expect(deriveClientType({ ownBranch: 'business' })).toBe('BUSINESS');
    expect(deriveClientType({ mixedBranch: 'individuals' })).toBe('INDIVIDUAL');
    expect(deriveClientType({ mixedBranch: 'clients' })).toBe('BUSINESS');
  });

  it('never decides an ambiguous answer', () => {
    expect(deriveClientType({ ownBranch: 'both' })).toBeNull();
    expect(deriveClientType({ mixedBranch: 'both' })).toBeNull();
    expect(deriveClientType({ ownBranch: 'undecided' })).toBeNull();
    expect(deriveClientType({ clarificationAnswer: 'undecided' })).toBeNull();
  });

  it('never derives from accountType alone', () => {
    // CLIENT / SERVICE_PROVIDER say nothing about Individual vs Business.
    expect(deriveClientType({ classification: 'CLIENT' })).toBeNull();
    expect(deriveClientType({ classification: 'SERVICE_PROVIDER' })).toBeNull();
  });

  it('tolerates missing or malformed input', () => {
    expect(deriveClientType(null)).toBeNull();
    expect(deriveClientType(undefined)).toBeNull();
    expect(deriveClientType({})).toBeNull();
    expect(deriveClientType('nope')).toBeNull();
    expect(deriveClientType(42)).toBeNull();
  });
});
