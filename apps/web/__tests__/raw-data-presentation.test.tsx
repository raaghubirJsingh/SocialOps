/**
 * RawData human-readable presentation contracts.
 *
 * Presentation only: stored RawData values must be preserved exactly, missing
 * fields must never be invented, malformed metadata must not crash rendering,
 * and unknown metadata must remain available under collapsed raw JSON.
 */
import { renderToStaticMarkup } from 'react-dom/server';

import { RawDataSummary } from '@/components/raw-data/raw-data-summary';
import type { RawDataDto } from '@/types/content';

function record(overrides: Partial<RawDataDto> = {}): RawDataDto {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    clientId: '22222222-2222-2222-2222-222222222222',
    source: 'CLIENT_FORM',
    contentId: null,
    mimeType: null,
    originalFileName: null,
    extractedText: null,
    metadata: null,
    contentHash: 'abc123',
    byteSize: null,
    capturedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    capturedByUserId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    ...overrides,
  };
}

describe('RawDataSummary presentation', () => {
  it('shows the request brief prominently', () => {
    const html = renderToStaticMarkup(
      <RawDataSummary record={record({ extractedText: '  Diwali launch brief  ' })} />,
    );
    expect(html).toContain('Request');
    expect(html).toContain('Diwali launch brief');
  });

  it('renders known metadata fields with readable labels', () => {
    const html = renderToStaticMarkup(
      <RawDataSummary
        record={record({
          extractedText: 'Launch brief',
          metadata: {
            contentPurpose: 'Promotion',
            contentCategory: 'Offer',
            contentType: 'Reel',
            platform: ['Instagram', 'Facebook'],
            language: ['Hindi'],
            tone: 'Promotional',
          },
        })}
      />,
    );
    for (const label of [
      'Purpose',
      'Category',
      'Content type',
      'Platform(s)',
      'Language',
      'Tone',
    ]) {
      expect(html).toContain(label);
    }
    expect(html).toContain('Promotion');
    expect(html).toContain('Instagram');
    expect(html).toContain('Facebook');
    expect(html).toContain('Hindi');
  });

  it('omits missing fields instead of inventing values', () => {
    const html = renderToStaticMarkup(
      <RawDataSummary record={record({ extractedText: 'Brief only' })} />,
    );
    expect(html).toContain('Brief only');
    expect(html).not.toContain('Purpose');
    expect(html).not.toContain('Platform(s)');
    expect(html).not.toContain('—');
  });

  it('keeps unknown fields available in collapsed raw metadata', () => {
    const html = renderToStaticMarkup(
      <RawDataSummary
        record={record({
          extractedText: 'Brief',
          metadata: { contentPurpose: 'Promotion', mysteryField: 'mystery-value' },
        })}
      />,
    );
    expect(html).toContain('Promotion');
    expect(html).toContain('View original details');
    expect(html).toContain('mysteryField');
    expect(html).toContain('mystery-value');
  });

  it('handles null and malformed metadata without crashing', () => {
    for (const metadata of [null, 'not-an-object', 42, ['a'], undefined]) {
      const html = renderToStaticMarkup(
        <RawDataSummary
          record={record({ extractedText: 'Brief', metadata: metadata as never })}
        />,
      );
      expect(html).toContain('Brief');
      expect(html).not.toContain('View original details');
    }
  });
});
