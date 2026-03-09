import { describe, expect, it } from 'vitest';

import { comparePageModels } from '@/js/compare/engine/compare-page-models.ts';
import { diffTextRuns } from '@/js/compare/engine/diff-text-runs.ts';
import {
  mergeIntoLines,
  sortCompareTextItems,
} from '@/js/compare/engine/extract-page-model.ts';
import type { ComparePageModel, CompareTextItem } from '@/js/compare/types.ts';

function makeItem(id: string, text: string): CompareTextItem {
  return {
    id,
    text,
    normalizedText: text,
    rect: { x: 0, y: 0, width: 10, height: 10 },
  };
}

function makePage(
  pageNumber: number,
  textItems: CompareTextItem[]
): ComparePageModel {
  return {
    pageNumber,
    width: 100,
    height: 100,
    textItems,
    plainText: textItems.map((item) => item.normalizedText).join(' '),
    hasText: textItems.length > 0,
    source: 'pdfjs',
  };
}

describe('diffTextRuns', () => {
  it('detects modified tokens as one change', () => {
    const result = diffTextRuns(
      [makeItem('a', 'Hello'), makeItem('b', 'world')],
      [makeItem('a', 'Hello'), makeItem('c', 'there')]
    );

    expect(result.summary).toEqual({ added: 0, removed: 0, modified: 1 });
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].type).toBe('modified');
    expect(result.changes[0].beforeText).toBe('world');
    expect(result.changes[0].afterText).toBe('there');
  });

  it('detects added tokens', () => {
    const result = diffTextRuns(
      [makeItem('a', 'Hello')],
      [makeItem('a', 'Hello'), makeItem('b', 'again')]
    );

    expect(result.summary).toEqual({ added: 1, removed: 0, modified: 0 });
    expect(result.changes[0].type).toBe('added');
  });

  it('splits compound replacements into discrete changes', () => {
    const result = diffTextRuns(
      [
        makeItem('a', 'This'),
        makeItem('b', 'is'),
        makeItem('c', 'an'),
        makeItem('d', 'example'),
        makeItem('e', 'of'),
        makeItem('f', 'a'),
        makeItem('g', 'data'),
        makeItem('h', 'table'),
        makeItem('i', 'new.'),
        makeItem('j', 'Disabilit'),
      ],
      [
        makeItem('k', 'Example'),
        makeItem('l', 'table'),
        makeItem('m', 'This'),
        makeItem('n', 'is'),
        makeItem('o', 'an'),
        makeItem('p', 'example'),
        makeItem('q', 'of'),
        makeItem('r', 'a'),
        makeItem('s', 'data'),
        makeItem('t', 'table.'),
        makeItem('u', 'Disability'),
      ]
    );

    expect(result.changes).toHaveLength(2);
    expect(result.summary).toEqual({ added: 1, removed: 0, modified: 1 });
    expect(
      result.changes.some(
        (change) =>
          change.type === 'added' && change.afterText === 'Example table'
      )
    ).toBe(true);
    expect(
      result.changes.some(
        (change) =>
          change.type === 'modified' &&
          change.beforeText === 'table new. Disabilit' &&
          change.afterText === 'table. Disability'
      )
    ).toBe(true);
  });
});

describe('comparePageModels', () => {
  it('marks pages missing from the second document', () => {
    const result = comparePageModels(
      makePage(3, [makeItem('a', 'Only')]),
      null
    );

    expect(result.status).toBe('left-only');
    expect(result.summary.removed).toBe(1);
    expect(result.changes[0].type).toBe('page-removed');
  });
});

describe('sortCompareTextItems', () => {
  it('orders tokens by reading order', () => {
    const items: CompareTextItem[] = [
      {
        ...makeItem('b', 'Body'),
        rect: { x: 60, y: 40, width: 10, height: 10 },
      },
      {
        ...makeItem('a', 'Title'),
        rect: { x: 10, y: 10, width: 10, height: 10 },
      },
      {
        ...makeItem('c', 'Next'),
        rect: { x: 10, y: 40, width: 10, height: 10 },
      },
    ];

    expect(
      sortCompareTextItems(items).map((item) => item.normalizedText)
    ).toEqual(['Title', 'Next', 'Body']);
  });
});

describe('mergeIntoLines', () => {
  it('merges items on the same Y-line into one item', () => {
    const items: CompareTextItem[] = [
      {
        id: '0',
        text: 'Hello',
        normalizedText: 'Hello',
        rect: { x: 0, y: 10, width: 50, height: 12 },
      },
      {
        id: '1',
        text: 'World',
        normalizedText: 'World',
        rect: { x: 60, y: 10, width: 50, height: 12 },
      },
    ];
    const merged = mergeIntoLines(sortCompareTextItems(items));

    expect(merged).toHaveLength(1);
    expect(merged[0].normalizedText).toBe('Hello World');
    expect(merged[0].rect.x).toBe(0);
    expect(merged[0].rect.width).toBe(110);
  });

  it('does not insert spaces inside a split word', () => {
    const items: CompareTextItem[] = [
      {
        id: '0',
        text: 'sam',
        normalizedText: 'sam',
        rect: { x: 0, y: 10, width: 24, height: 12 },
      },
      {
        id: '1',
        text: 'e',
        normalizedText: 'e',
        rect: { x: 24.4, y: 10, width: 8, height: 12 },
      },
    ];

    const merged = mergeIntoLines(sortCompareTextItems(items));

    expect(merged).toHaveLength(1);
    expect(merged[0].normalizedText).toBe('same');
  });

  it('keeps items on different Y-lines separate', () => {
    const items: CompareTextItem[] = [
      {
        id: '0',
        text: 'Line 1',
        normalizedText: 'Line 1',
        rect: { x: 0, y: 10, width: 50, height: 12 },
      },
      {
        id: '1',
        text: 'Line 2',
        normalizedText: 'Line 2',
        rect: { x: 0, y: 30, width: 50, height: 12 },
      },
    ];
    const merged = mergeIntoLines(sortCompareTextItems(items));

    expect(merged).toHaveLength(2);
    expect(merged[0].normalizedText).toBe('Line 1');
    expect(merged[1].normalizedText).toBe('Line 2');
  });

  it('produces same result for different text run boundaries', () => {
    const pdf1Items: CompareTextItem[] = [
      {
        id: '0',
        text: 'Hello World',
        normalizedText: 'Hello World',
        rect: { x: 0, y: 10, width: 100, height: 12 },
      },
    ];
    const pdf2Items: CompareTextItem[] = [
      {
        id: '0',
        text: 'Hello',
        normalizedText: 'Hello',
        rect: { x: 0, y: 10, width: 45, height: 12 },
      },
      {
        id: '1',
        text: 'World',
        normalizedText: 'World',
        rect: { x: 55, y: 10, width: 45, height: 12 },
      },
    ];

    const merged1 = mergeIntoLines(sortCompareTextItems(pdf1Items));
    const merged2 = mergeIntoLines(sortCompareTextItems(pdf2Items));

    expect(merged1[0].normalizedText).toBe(merged2[0].normalizedText);

    const result = diffTextRuns(merged1, merged2);
    expect(result.changes).toHaveLength(0);
  });

  it('detects actual changes after merging', () => {
    const pdf1Items: CompareTextItem[] = [
      {
        id: '0',
        text: 'Sample',
        normalizedText: 'Sample',
        rect: { x: 0, y: 10, width: 60, height: 14 },
      },
      {
        id: '1',
        text: 'page text here',
        normalizedText: 'page text here',
        rect: { x: 0, y: 30, width: 120, height: 14 },
      },
    ];
    const pdf2Items: CompareTextItem[] = [
      {
        id: '0',
        text: 'Sample',
        normalizedText: 'Sample',
        rect: { x: 0, y: 10, width: 45, height: 14 },
      },
      {
        id: '1',
        text: 'PDF',
        normalizedText: 'PDF',
        rect: { x: 55, y: 10, width: 30, height: 14 },
      },
      {
        id: '2',
        text: 'pages text here',
        normalizedText: 'pages text here',
        rect: { x: 0, y: 30, width: 125, height: 14 },
      },
    ];

    const merged1 = mergeIntoLines(sortCompareTextItems(pdf1Items));
    const merged2 = mergeIntoLines(sortCompareTextItems(pdf2Items));

    expect(merged1).toHaveLength(2);
    expect(merged2).toHaveLength(2);

    const result = diffTextRuns(merged1, merged2);
    expect(result.summary.modified).toBe(1);
    expect(result.summary.added).toBe(0);
    expect(result.summary.removed).toBe(0);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].beforeText).toBe('page');
    expect(result.changes[0].afterText).toBe('PDF pages');
  });

  it('preserves original casing in change descriptions', () => {
    const result = diffTextRuns(
      [makeItem('a', 'Sample')],
      [makeItem('b', 'Sample PDF')]
    );

    expect(result.changes[0].afterText).toBe('PDF');
  });

  it('ignores joined versus split words when collapsed text matches', () => {
    const result = diffTextRuns(
      [makeItem('a', 'non'), makeItem('b', 'tincidunt')],
      [makeItem('c', 'nontincidunt')]
    );

    expect(result.changes).toHaveLength(0);
    expect(result.summary).toEqual({ added: 0, removed: 0, modified: 0 });
  });
});
