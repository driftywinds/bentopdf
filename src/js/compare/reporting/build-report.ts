import type { ComparePagePair, ComparePageResult } from '../types.ts';

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function buildCompareReport(
  fileName1: string,
  fileName2: string,
  pairs: ComparePagePair[],
  results: ComparePageResult[]
) {
  const totals = results.reduce(
    (summary, result) => {
      summary.added += result.summary.added;
      summary.removed += result.summary.removed;
      summary.modified += result.summary.modified;
      return summary;
    },
    { added: 0, removed: 0, modified: 0 }
  );

  const rows = results
    .map((result, index) => {
      const pair = pairs[index];
      const changes = result.changes
        .map(
          (change) =>
            `<li><strong>${escapeHtml(change.type)}</strong>: ${escapeHtml(change.description)}</li>`
        )
        .join('');

      return `
        <section class="pair-card">
          <h2>Comparison ${pair?.pairIndex || index + 1}</h2>
          <p class="meta">PDF 1 page: ${pair?.leftPageNumber ?? 'none'} | PDF 2 page: ${pair?.rightPageNumber ?? 'none'} | Confidence: ${((pair?.confidence || 0) * 100).toFixed(0)}%</p>
          <p class="meta">Status: ${escapeHtml(result.status)}${result.usedOcr ? ' | OCR used' : ''}</p>
          <p class="meta">Added: ${result.summary.added} | Removed: ${result.summary.removed} | Modified: ${result.summary.modified}</p>
          <ul>${changes || '<li>No semantic changes detected.</li>'}</ul>
        </section>
      `;
    })
    .join('');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Compare report</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; padding: 2rem; background: #111827; color: #e5e7eb; }
      .summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; margin: 1.5rem 0; }
      .card, .pair-card { background: #1f2937; border: 1px solid #374151; border-radius: 12px; padding: 1rem 1.25rem; }
      .pair-card { margin-bottom: 1rem; }
      .meta { color: #9ca3af; font-size: 0.95rem; }
      h1, h2 { margin: 0 0 0.75rem 0; }
      ul { margin: 0.75rem 0 0 1.25rem; }
    </style>
  </head>
  <body>
    <h1>PDF Compare Report</h1>
    <p class="meta">PDF 1: ${escapeHtml(fileName1)} | PDF 2: ${escapeHtml(fileName2)}</p>
    <div class="summary">
      <div class="card"><div class="meta">Added</div><div>${totals.added}</div></div>
      <div class="card"><div class="meta">Removed</div><div>${totals.removed}</div></div>
      <div class="card"><div class="meta">Modified</div><div>${totals.modified}</div></div>
    </div>
    ${rows}
  </body>
</html>`;
}
