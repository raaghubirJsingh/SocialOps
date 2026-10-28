/**
 * Clients list server-side search contracts.
 *
 * Asserts the Clients page source (search input, debounce, query key,
 * placeholderData, distinct empty states) and the client-api helper that
 * carries `q` as a URL query parameter. Source is read with comments stripped
 * so assertions match executable code, not prose.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function sourceWithoutComments(relPath: string): string {
  const raw = readFileSync(join(__dirname, '..', relPath), 'utf8');
  return raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('Clients list search contracts', () => {
  it('client-api sends q as an encoded URL query parameter', () => {
    const src = sourceWithoutComments('lib/client-api.ts');
    expect(src).toMatch(/listClients:\s*\(q\?:/);
    expect(src).toMatch(/encodeURIComponent\(q\)/);
    expect(src).toMatch(/\/clients\$\{q \?/);
  });

  it('page debounces the search term into the query key', () => {
    const src = sourceWithoutComments('app/(app)/clients/page.tsx');
    // ~300ms debounce via a timeout, no new dependency.
    expect(src).toMatch(/setTimeout\(/);
    expect(src).toMatch(/300/);
    expect(src).toMatch(/clearTimeout\(/);
    // The DEBOUNCED term is part of the query key and passed to the API.
    expect(src).toMatch(/queryKey:\s*\['clients',\s*activeOrganizationId,\s*trimmedSearch\]/);
    expect(src).toMatch(/listClients\(trimmedSearch \|\| undefined\)/);
  });

  it('keeps previous results while a new search resolves', () => {
    const src = sourceWithoutComments('app/(app)/clients/page.tsx');
    expect(src).toMatch(/keepPreviousData/);
  });

  it('renders an accessible search input', () => {
    const src = sourceWithoutComments('app/(app)/clients/page.tsx');
    expect(src).toMatch(/role="search"/);
    expect(src).toMatch(/type="search"/);
    expect(src).toMatch(/aria-label="Search clients"/);
    // Polite, screen-reader-only result announcement.
    expect(src).toMatch(/aria-live="polite"/);
    expect(src).toMatch(/sr-only/);
  });

  it('distinguishes the "no matches" empty state from "no clients yet"', () => {
    const src = sourceWithoutComments('app/(app)/clients/page.tsx');
    expect(src).toMatch(/No clients match your search/);
    expect(src).toMatch(/No clients yet/);
  });

  it('never persists or logs the search term', () => {
    const src = sourceWithoutComments('app/(app)/clients/page.tsx');
    expect(src).not.toMatch(/localStorage/);
    expect(src).not.toMatch(/sessionStorage/);
    expect(src).not.toMatch(/console\.log/);
  });
});
