/**
 * Client-facing Content Request terminology contracts.
 *
 * Presentation-only: the client workflow must say Content Request /
 * Requests / Waiting for agency, never "Task", and client-facing surfaces
 * covered by the approved plan must not show "Raw data" / "Intake" /
 * "Raw metadata". Agency-facing wording and every internal RawData
 * identifier (routes, keys, component names, backend) are deliberately
 * untouched — this suite pins the split between the two vocabularies.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';

import { ContentList } from '@/components/content/content-list';
import { CLIENT_NAV_ITEMS } from '@/components/layout/sidebar';
import { RawDataList } from '@/components/raw-data/raw-data-list';
import type { RawDataDto } from '@/types/content';

const read = (relativePath: string): string =>
  readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

function record(overrides: Partial<RawDataDto> = {}): RawDataDto {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    clientId: '22222222-2222-2222-2222-222222222222',
    source: 'CLIENT_FORM',
    contentId: null,
    mimeType: null,
    originalFileName: null,
    extractedText: 'Diwali launch brief',
    metadata: null,
    contentHash: 'abcdef1234567890',
    byteSize: null,
    capturedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    capturedByUserId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    ...overrides,
  };
}

describe('RawDataList client variant (Content Requests presentation)', () => {
  it('shows request terminology and Submitted date without internal state', () => {
    const html = renderToStaticMarkup(
      <RawDataList variant="client" records={[record()]} />,
    );
    expect(html).toContain('Waiting for draft');
    expect(html).toContain('Submitted');
    expect(html).toContain('Diwali launch brief');
    // No technical debug details and no source vocabulary for clients.
    expect(html).not.toContain('sha256:');
    expect(html).not.toContain('captured');
    expect(html).not.toContain('Client form');
    // Raw JSON never appears by default.
    expect(html).not.toContain('<pre');
  });

  it('uses client empty copy', () => {
    const html = renderToStaticMarkup(
      <RawDataList variant="client" records={[]} />,
    );
    expect(html).toContain('No requests yet.');
    expect(html).not.toContain('No raw intake recorded yet.');
  });

  it('keeps the agency view wording unchanged (default variant)', () => {
    const html = renderToStaticMarkup(<RawDataList records={[record()]} />);
    expect(html).toContain('sha256:abcdef123456…');
    expect(html).toContain('captured');
    expect(html).toContain('Client form');
    expect(html).not.toContain('Waiting for agency');

    const emptyHtml = renderToStaticMarkup(<RawDataList records={[]} />);
    expect(emptyHtml).toContain('No raw intake recorded yet.');
  });
});

describe('ContentList empty state', () => {
  it('defaults to Nothing here yet when no override is passed', () => {
    const html = renderToStaticMarkup(
      <ContentList items={[]} detailHref={(id) => id} emptyDescription="x" />,
    );
    expect(html).toContain('Nothing here yet');
  });

  it('supports the No drafts yet override used by the client Content page', () => {
    const html = renderToStaticMarkup(
      <ContentList
        items={[]}
        detailHref={(id) => id}
        emptyDescription="Your agency creates drafts from your requests. You have 1 request waiting for agency."
        emptyTitle="No drafts yet"
      />,
    );
    expect(html).toContain('No drafts yet');
    expect(html).not.toContain('Nothing here yet');
    expect(html).toContain('waiting for agency');
  });
});


describe('client-facing copy sources', () => {
  it('client Content page uses Content Request wording and the requests section', () => {
    const page = read('app/(app)/client/content/page.tsx');
    expect(page).toContain('My Content Requests');
    expect(page).toContain('Submit Content Request');
    expect(page).toContain('useContentRequests');
    expect(page).not.toContain('ContentPipeline');
    expect(page).not.toContain('ContentStatus');
    expect(page).toContain('variant="client"');
    expect(page).not.toContain('Submit Intake Request');
    expect(page).not.toContain('Raw Data');
    expect(page).not.toContain('Nothing here yet');
    expect(page).toContain('<CardTitle className="text-base">Requests shown</CardTitle>');
    expect(page).toContain('requests loaded');
    expect(page).not.toContain('Request count');
  });

  it('client requests page uses Content Requests wording', () => {
    const page = read('app/(app)/client/raw-data/page.tsx');
    expect(page).toContain('Content Requests');
    expect(page).toContain('Submit Content Request');
    expect(page).toContain('My Requests');
    expect(page).toContain('submitLabel="Submit Content Request"');
    expect(page).not.toContain('Record intake');
    expect(page).not.toContain('My raw data');
    expect(page).not.toContain('Raw data');
  });

  it('topbar and dashboard card expose Requests, never Raw data or Intake', () => {
    const topbar = read('components/layout/topbar.tsx');
    expect(topbar).toContain(`'/client/raw-data': 'Requests'`);
    expect(topbar).not.toContain(`'/client/raw-data': 'Raw data'`);

    const shell = read('components/client/client-dashboard-shell.tsx');
    expect(shell).toContain('<CardTitle>Requests</CardTitle>');
    expect(shell).toContain('href={`/client/content?clientId=${client.id}`}');
    expect(shell).not.toContain('Raw data');
    expect(shell).not.toContain('intake');

    const confirmation = read(
      'components/client/raw-data/submission-confirmation.tsx',
    );
    expect(confirmation).toContain('View my requests');
    expect(confirmation).toContain('`/client/content?clientId=${clientId}`');
    expect(confirmation).toContain('sent to your agency');
    expect(confirmation).not.toContain('intake');
  });

  it('no client sidebar navigation item was added (structure unchanged)', () => {
    expect(
      CLIENT_NAV_ITEMS.some((item) => item.href.includes('raw-data')),
    ).toBe(false);
    expect(CLIENT_NAV_ITEMS.map((item) => item.href)).toEqual([
      '/dashboard',
      '/client/profile',
      '/client/social-accounts',
      '/client/content',
      '/client/notifications',
    ]);
  });

  it('never uses Task for the client-submitted request', () => {
    const surfaces = [
      'app/(app)/client/content/page.tsx',
      'app/(app)/client/raw-data/page.tsx',
      'components/client/client-dashboard-shell.tsx',
      'components/client/raw-data/submission-confirmation.tsx',
      'components/raw-data/raw-data-list.tsx',
      'components/layout/topbar.tsx',
    ];
    for (const file of surfaces) {
      expect(read(file)).not.toMatch(/\bTask\b/);
    }
  });

  it('agency-facing terminology is preserved', () => {
    expect(read('components/clients/client-section-nav.tsx')).toContain(
      `href: '/raw-data', label: 'Raw data'`,
    );
    const agencyPage = read('app/(app)/clients/[clientId]/raw-data/page.tsx');
    expect(agencyPage).toContain('Record intake');
    expect(agencyPage).toContain('Raw data');
    expect(read('components/raw-data/raw-data-list.tsx')).toContain(
      `title = 'Raw data'`,
    );
    expect(read('components/raw-data/raw-data-intake-form.tsx')).toContain(
      `submitLabel = 'Record intake'`,
    );
    expect(read('components/raw-data/raw-data-list.tsx')).toContain(
      'Draft from intake',
    );
  });

  it('client review actions use client-facing language and hide lifecycle statuses', () => {
    const portal = read('components/content/client-review-portal.tsx');
    expect(portal).toContain('Request Changes');
    expect(portal).toContain('Confirm Content');
    // Publishing is deferred (AGENTS.md §13): the client portal must not
    // offer a publishing approval action.
    expect(portal).not.toContain('Approve for Publishing');
    for (const status of [
      'DRAFT',
      'IN_REVIEW',
      'UNDER_CLIENT_REVIEW',
      'AWAITING_MANAGER_APPROVAL',
      'CHANGES_REQUESTED',
      'FINAL_CONFIRMED',
      'ARCHIVED',
    ]) {
      expect(portal).not.toContain(status);
    }
  });
});
