import { buildCompareReport } from './build-report.ts';
import type { ComparePagePair, ComparePageResult } from '../types.ts';

export function exportCompareHtmlReport(
  fileName1: string,
  fileName2: string,
  pairs: ComparePagePair[],
  results: ComparePageResult[]
) {
  const html = buildCompareReport(fileName1, fileName2, pairs, results);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'bentopdf-compare-report.html';
  anchor.click();
  URL.revokeObjectURL(url);
}
