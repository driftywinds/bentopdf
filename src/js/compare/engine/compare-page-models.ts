import type { ComparePageModel, ComparePageResult } from '../types.ts';
import { diffTextRuns } from './diff-text-runs.ts';

export function comparePageModels(
  leftPage: ComparePageModel | null,
  rightPage: ComparePageModel | null
): ComparePageResult {
  if (leftPage && !rightPage) {
    return {
      status: 'left-only',
      leftPageNumber: leftPage.pageNumber,
      rightPageNumber: null,
      changes: [
        {
          id: 'page-removed',
          type: 'page-removed',
          description: `Page ${leftPage.pageNumber} exists only in the first PDF.`,
          beforeText: leftPage.plainText.slice(0, 200),
          afterText: '',
          beforeRects: [],
          afterRects: [],
        },
      ],
      summary: { added: 0, removed: 1, modified: 0 },
      visualDiff: null,
      usedOcr: leftPage.source === 'ocr',
    };
  }

  if (!leftPage && rightPage) {
    return {
      status: 'right-only',
      leftPageNumber: null,
      rightPageNumber: rightPage.pageNumber,
      changes: [
        {
          id: 'page-added',
          type: 'page-added',
          description: `Page ${rightPage.pageNumber} exists only in the second PDF.`,
          beforeText: '',
          afterText: rightPage.plainText.slice(0, 200),
          beforeRects: [],
          afterRects: [],
        },
      ],
      summary: { added: 1, removed: 0, modified: 0 },
      visualDiff: null,
      usedOcr: rightPage.source === 'ocr',
    };
  }

  if (!leftPage || !rightPage) {
    return {
      status: 'match',
      leftPageNumber: null,
      rightPageNumber: null,
      changes: [],
      summary: { added: 0, removed: 0, modified: 0 },
      visualDiff: null,
      usedOcr: false,
    };
  }

  const { changes, summary } = diffTextRuns(
    leftPage.textItems,
    rightPage.textItems
  );

  return {
    status: changes.length > 0 ? 'changed' : 'match',
    leftPageNumber: leftPage.pageNumber,
    rightPageNumber: rightPage.pageNumber,
    changes,
    summary,
    visualDiff: null,
    usedOcr: leftPage.source === 'ocr' || rightPage.source === 'ocr',
  };
}
