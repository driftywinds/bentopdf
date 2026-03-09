import { showLoader, hideLoader, showAlert } from '../ui.js';
import { getPDFDocument } from '../utils/helpers.js';
import { icons, createIcons } from 'lucide';
import * as pdfjsLib from 'pdfjs-dist';
import { CompareState } from '@/types';
import type {
  CompareFilterType,
  ComparePageModel,
  ComparePagePair,
  ComparePageResult,
  CompareTextChange,
} from '../compare/types.ts';
import { extractPageModel } from '../compare/engine/extract-page-model.ts';
import { comparePageModels } from '../compare/engine/compare-page-models.ts';
import { renderVisualDiff } from '../compare/engine/visual-diff.ts';
import { extractDocumentSignatures } from '../compare/engine/page-signatures.ts';
import { pairPages } from '../compare/engine/pair-pages.ts';
import { recognizePageCanvas } from '../compare/engine/ocr-page.ts';
import { exportCompareHtmlReport } from '../compare/reporting/export-html-report.ts';
import { isLowQualityExtractedText } from '../compare/engine/text-normalization.ts';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

const pageState: CompareState = {
  pdfDoc1: null,
  pdfDoc2: null,
  currentPage: 1,
  viewMode: 'side-by-side',
  isSyncScroll: true,
  currentComparison: null,
  activeChangeIndex: 0,
  pagePairs: [],
  activeFilter: 'all',
  changeSearchQuery: '',
  useOcr: true,
  ocrLanguage: 'eng',
};

const pageModelCache = new Map<string, ComparePageModel>();
const comparisonCache = new Map<string, ComparePageResult>();
const comparisonResultsCache = new Map<number, ComparePageResult>();
const documentNames = {
  left: 'first.pdf',
  right: 'second.pdf',
};

type RenderedPage = {
  model: ComparePageModel | null;
  exists: boolean;
};

type ComparisonPageLoad = {
  model: ComparePageModel | null;
  exists: boolean;
};

type DiffFocusRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function getElement<T extends HTMLElement>(id: string) {
  return document.getElementById(id) as T | null;
}

function clearCanvas(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d');
  canvas.width = 1;
  canvas.height = 1;
  context?.clearRect(0, 0, 1, 1);
}

function renderMissingPage(
  canvas: HTMLCanvasElement,
  placeholderId: string,
  message: string
) {
  clearCanvas(canvas);
  const placeholder = getElement<HTMLDivElement>(placeholderId);
  if (placeholder) {
    placeholder.textContent = message;
    placeholder.classList.remove('hidden');
  }
}

function hidePlaceholder(placeholderId: string) {
  const placeholder = getElement<HTMLDivElement>(placeholderId);
  placeholder?.classList.add('hidden');
}

function getRenderScale(page: pdfjsLib.PDFPageProxy, container: HTMLElement) {
  const baseViewport = page.getViewport({ scale: 1.0 });
  const availableWidth = Math.max(
    container.clientWidth - (pageState.viewMode === 'overlay' ? 96 : 56),
    320
  );
  const fitScale = availableWidth / Math.max(baseViewport.width, 1);
  const maxScale = pageState.viewMode === 'overlay' ? 2.5 : 2.0;

  return Math.min(Math.max(fitScale, 1.0), maxScale);
}

function getPageModelCacheKey(
  cacheKeyPrefix: 'left' | 'right',
  pageNum: number,
  scale: number
) {
  return `${cacheKeyPrefix}-${pageNum}-${scale.toFixed(3)}`;
}

function shouldUseOcrForModel(model: ComparePageModel) {
  return !model.hasText || isLowQualityExtractedText(model.plainText);
}

function buildDiffFocusRegion(
  comparison: ComparePageResult,
  leftCanvas: HTMLCanvasElement,
  rightCanvas: HTMLCanvasElement
): DiffFocusRegion | undefined {
  const leftOffsetX = Math.floor(
    (Math.max(leftCanvas.width, rightCanvas.width) - leftCanvas.width) / 2
  );
  const leftOffsetY = Math.floor(
    (Math.max(leftCanvas.height, rightCanvas.height) - leftCanvas.height) / 2
  );
  const rightOffsetX = Math.floor(
    (Math.max(leftCanvas.width, rightCanvas.width) - rightCanvas.width) / 2
  );
  const rightOffsetY = Math.floor(
    (Math.max(leftCanvas.height, rightCanvas.height) - rightCanvas.height) / 2
  );
  const bounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };

  for (const change of comparison.changes) {
    for (const rect of change.beforeRects) {
      bounds.minX = Math.min(bounds.minX, rect.x + leftOffsetX);
      bounds.minY = Math.min(bounds.minY, rect.y + leftOffsetY);
      bounds.maxX = Math.max(bounds.maxX, rect.x + leftOffsetX + rect.width);
      bounds.maxY = Math.max(bounds.maxY, rect.y + leftOffsetY + rect.height);
    }

    for (const rect of change.afterRects) {
      bounds.minX = Math.min(bounds.minX, rect.x + rightOffsetX);
      bounds.minY = Math.min(bounds.minY, rect.y + rightOffsetY);
      bounds.maxX = Math.max(bounds.maxX, rect.x + rightOffsetX + rect.width);
      bounds.maxY = Math.max(bounds.maxY, rect.y + rightOffsetY + rect.height);
    }
  }

  if (!Number.isFinite(bounds.minX)) {
    return undefined;
  }

  const fullWidth = Math.max(leftCanvas.width, rightCanvas.width, 1);
  const fullHeight = Math.max(leftCanvas.height, rightCanvas.height, 1);
  const padding = 40;

  const x = Math.max(Math.floor(bounds.minX - padding), 0);
  const y = Math.max(Math.floor(bounds.minY - padding), 0);
  const maxX = Math.min(Math.ceil(bounds.maxX + padding), fullWidth);
  const maxY = Math.min(Math.ceil(bounds.maxY + padding), fullHeight);

  return {
    x,
    y,
    width: Math.max(maxX - x, Math.min(320, fullWidth)),
    height: Math.max(maxY - y, Math.min(200, fullHeight)),
  };
}

async function renderPage(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageNum: number,
  canvas: HTMLCanvasElement,
  container: HTMLElement,
  placeholderId: string,
  cacheKeyPrefix: 'left' | 'right'
): Promise<RenderedPage> {
  if (pageNum > pdfDoc.numPages) {
    renderMissingPage(
      canvas,
      placeholderId,
      `Page ${pageNum} does not exist in this PDF.`
    );
    return { model: null, exists: false };
  }

  const page = await pdfDoc.getPage(pageNum);

  const targetScale = getRenderScale(page, container);
  const scaledViewport = page.getViewport({ scale: targetScale });
  const dpr = window.devicePixelRatio || 1;
  const hiResViewport = page.getViewport({ scale: targetScale * dpr });

  hidePlaceholder(placeholderId);

  canvas.width = hiResViewport.width;
  canvas.height = hiResViewport.height;
  canvas.style.width = `${scaledViewport.width}px`;
  canvas.style.height = `${scaledViewport.height}px`;

  const cacheKey = getPageModelCacheKey(cacheKeyPrefix, pageNum, targetScale);
  const cachedModel = pageModelCache.get(cacheKey);
  const modelPromise = cachedModel
    ? Promise.resolve(cachedModel)
    : extractPageModel(page, scaledViewport);
  const renderTask = page.render({
    canvasContext: canvas.getContext('2d')!,
    viewport: hiResViewport,
    canvas,
  }).promise;

  const [model] = await Promise.all([modelPromise, renderTask]);

  let finalModel = model;

  if (!cachedModel && pageState.useOcr && shouldUseOcrForModel(model)) {
    showLoader(`Running OCR on page ${pageNum}...`);
    const ocrModel = await recognizePageCanvas(
      canvas,
      pageState.ocrLanguage,
      function (status, progress) {
        showLoader(`OCR: ${status}`, progress * 100);
      }
    );
    finalModel = {
      ...ocrModel,
      pageNumber: pageNum,
    };
  }

  pageModelCache.set(cacheKey, finalModel);

  return { model: finalModel, exists: true };
}

async function loadComparisonPage(
  pdfDoc: pdfjsLib.PDFDocumentProxy | null,
  pageNum: number | null,
  side: 'left' | 'right',
  renderTarget?: {
    canvas: HTMLCanvasElement;
    container: HTMLElement;
    placeholderId: string;
  }
): Promise<ComparisonPageLoad> {
  if (!pdfDoc || !pageNum) {
    if (renderTarget) {
      renderMissingPage(
        renderTarget.canvas,
        renderTarget.placeholderId,
        'No paired page for this side.'
      );
    }
    return { model: null, exists: false };
  }

  if (renderTarget) {
    return renderPage(
      pdfDoc,
      pageNum,
      renderTarget.canvas,
      renderTarget.container,
      renderTarget.placeholderId,
      side
    );
  }

  const renderScale = 1.2;
  const cacheKey = getPageModelCacheKey(side, pageNum, renderScale);
  const cachedModel = pageModelCache.get(cacheKey);
  if (cachedModel) {
    return { model: cachedModel, exists: true };
  }

  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale: renderScale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Could not create offscreen comparison canvas.');
  }

  const extractedModel = await extractPageModel(page, viewport);
  await page.render({
    canvasContext: context,
    viewport,
    canvas,
  }).promise;

  let finalModel = extractedModel;
  if (pageState.useOcr && shouldUseOcrForModel(extractedModel)) {
    const ocrModel = await recognizePageCanvas(canvas, pageState.ocrLanguage);
    finalModel = {
      ...ocrModel,
      pageNumber: pageNum,
    };
  }

  pageModelCache.set(cacheKey, finalModel);
  return { model: finalModel, exists: true };
}

async function computeComparisonForPair(
  pair: ComparePagePair,
  options?: {
    renderTargets?: {
      left: {
        canvas: HTMLCanvasElement;
        container: HTMLElement;
        placeholderId: string;
      };
      right: {
        canvas: HTMLCanvasElement;
        container: HTMLElement;
        placeholderId: string;
      };
      diffCanvas?: HTMLCanvasElement;
    };
  }
) {
  const renderTargets = options?.renderTargets;
  const leftPage = await loadComparisonPage(
    pageState.pdfDoc1,
    pair.leftPageNumber,
    'left',
    renderTargets?.left
  );
  const rightPage = await loadComparisonPage(
    pageState.pdfDoc2,
    pair.rightPageNumber,
    'right',
    renderTargets?.right
  );

  const comparison = comparePageModels(leftPage.model, rightPage.model);
  comparison.confidence = pair.confidence;

  if (
    renderTargets?.diffCanvas &&
    comparison.status !== 'left-only' &&
    comparison.status !== 'right-only'
  ) {
    const focusRegion = buildDiffFocusRegion(
      comparison,
      renderTargets.left.canvas,
      renderTargets.right.canvas
    );
    comparison.visualDiff = renderVisualDiff(
      renderTargets.left.canvas,
      renderTargets.right.canvas,
      renderTargets.diffCanvas,
      focusRegion
    );
  } else if (renderTargets?.diffCanvas) {
    clearCanvas(renderTargets.diffCanvas);
  }

  return comparison;
}

function getActivePair() {
  return pageState.pagePairs[pageState.currentPage - 1] || null;
}

function getVisibleChanges(result: ComparePageResult | null) {
  if (!result) return [];

  const filteredByType =
    pageState.activeFilter === 'all'
      ? result.changes
      : result.changes.filter((change) => {
          if (pageState.activeFilter === 'removed') {
            return change.type === 'removed' || change.type === 'page-removed';
          }
          return change.type === pageState.activeFilter;
        });

  const searchQuery = pageState.changeSearchQuery.trim().toLowerCase();
  if (!searchQuery) {
    return filteredByType;
  }

  return filteredByType.filter((change) => {
    const searchableText = [
      change.description,
      change.beforeText,
      change.afterText,
    ]
      .join(' ')
      .toLowerCase();
    return searchableText.includes(searchQuery);
  });
}

function updateFilterButtons() {
  const pills: Array<{ id: string; filter: CompareFilterType }> = [
    { id: 'filter-modified', filter: 'modified' },
    { id: 'filter-added', filter: 'added' },
    { id: 'filter-removed', filter: 'removed' },
  ];

  pills.forEach(({ id, filter }) => {
    const button = getElement<HTMLButtonElement>(id);
    if (!button) return;
    button.classList.toggle('active', pageState.activeFilter === filter);
  });
}

function updateSummary() {
  const comparison = pageState.currentComparison;
  const addedCount = getElement<HTMLElement>('summary-added-count');
  const removedCount = getElement<HTMLElement>('summary-removed-count');
  const modifiedCount = getElement<HTMLElement>('summary-modified-count');
  const panelLabel1 = getElement<HTMLElement>('compare-panel-label-1');
  const panelLabel2 = getElement<HTMLElement>('compare-panel-label-2');

  if (panelLabel1) panelLabel1.textContent = documentNames.left;
  if (panelLabel2) panelLabel2.textContent = documentNames.right;

  if (!comparison) {
    if (addedCount) addedCount.textContent = '0';
    if (removedCount) removedCount.textContent = '0';
    if (modifiedCount) modifiedCount.textContent = '0';
    return;
  }

  if (addedCount) addedCount.textContent = comparison.summary.added.toString();
  if (removedCount)
    removedCount.textContent = comparison.summary.removed.toString();
  if (modifiedCount)
    modifiedCount.textContent = comparison.summary.modified.toString();
}

function renderHighlights() {
  const highlightLayer1 = getElement<HTMLDivElement>('highlights-1');
  const highlightLayer2 = getElement<HTMLDivElement>('highlights-2');

  if (!highlightLayer1 || !highlightLayer2) return;

  highlightLayer1.innerHTML = '';
  highlightLayer2.innerHTML = '';

  const comparison = pageState.currentComparison;
  if (!comparison) return;

  getVisibleChanges(comparison).forEach((change, index) => {
    const activeClass = index === pageState.activeChangeIndex ? ' active' : '';
    change.beforeRects.forEach((rect) => {
      const marker = document.createElement('div');
      marker.className = `compare-highlight ${change.type}${activeClass}`;
      marker.style.left = `${rect.x}px`;
      marker.style.top = `${rect.y}px`;
      marker.style.width = `${rect.width}px`;
      marker.style.height = `${rect.height}px`;
      highlightLayer1.appendChild(marker);
    });

    change.afterRects.forEach((rect) => {
      const marker = document.createElement('div');
      marker.className = `compare-highlight ${change.type}${activeClass}`;
      marker.style.left = `${rect.x}px`;
      marker.style.top = `${rect.y}px`;
      marker.style.width = `${rect.width}px`;
      marker.style.height = `${rect.height}px`;
      highlightLayer2.appendChild(marker);
    });
  });
}

function scrollToChange(change: CompareTextChange) {
  const panel1 = getElement<HTMLDivElement>('panel-1');
  const panel2 = getElement<HTMLDivElement>('panel-2');
  const firstBefore = change.beforeRects[0];
  const firstAfter = change.afterRects[0];

  if (panel1 && firstBefore) {
    panel1.scrollTo({
      top: Math.max(firstBefore.y - 40, 0),
      behavior: 'smooth',
    });
  }

  if (panel2 && firstAfter) {
    panel2.scrollTo({
      top: Math.max(firstAfter.y - 40, 0),
      behavior: 'smooth',
    });
  }
}

function renderChangeList() {
  const comparison = pageState.currentComparison;
  const list = getElement<HTMLDivElement>('compare-change-list');
  const emptyState = getElement<HTMLDivElement>('change-list-empty');
  const prevChangeBtn = getElement<HTMLButtonElement>('prev-change-btn');
  const nextChangeBtn = getElement<HTMLButtonElement>('next-change-btn');
  const exportReportBtn = getElement<HTMLButtonElement>('export-report-btn');

  if (
    !list ||
    !emptyState ||
    !prevChangeBtn ||
    !nextChangeBtn ||
    !exportReportBtn
  )
    return;

  list.innerHTML = '';
  const visibleChanges = getVisibleChanges(comparison);

  if (!comparison || visibleChanges.length === 0) {
    emptyState.textContent =
      comparison?.status === 'match'
        ? 'No differences detected on this page.'
        : 'No changes match the current filter.';
    emptyState.classList.remove('hidden');
    list.classList.add('hidden');
    prevChangeBtn.disabled = true;
    nextChangeBtn.disabled = true;
    exportReportBtn.disabled = pageState.pagePairs.length === 0;
    return;
  }

  emptyState.classList.add('hidden');
  list.classList.remove('hidden');

  visibleChanges.forEach((change, index) => {
    const item = document.createElement('div');
    item.className = `compare-change-item${index === pageState.activeChangeIndex ? ' active' : ''}`;
    item.innerHTML = `
            <span class="compare-change-dot ${change.type}"></span>
            <div class="compare-change-desc">
                <div class="compare-change-desc-text">${change.description}</div>
            </div>
            <span class="compare-change-type ${change.type}">${change.type.replace('-', ' ')}</span>
        `;

    item.addEventListener('click', function () {
      pageState.activeChangeIndex = index;
      renderComparisonUI();
      scrollToChange(change);
    });

    list.appendChild(item);
  });

  prevChangeBtn.disabled = false;
  nextChangeBtn.disabled = false;
  exportReportBtn.disabled = pageState.pagePairs.length === 0;
}

function renderComparisonUI() {
  updateFilterButtons();
  renderHighlights();
  renderChangeList();
  updateSummary();
}

async function buildPagePairs() {
  if (!pageState.pdfDoc1 || !pageState.pdfDoc2) return;

  showLoader('Building page pairing model...', 0);

  const leftSignatures = await extractDocumentSignatures(
    pageState.pdfDoc1,
    function (pageNumber, totalPages) {
      showLoader(
        `Indexing PDF 1 page ${pageNumber} of ${totalPages}...`,
        (pageNumber / Math.max(totalPages * 2, 1)) * 100
      );
    }
  );
  const rightSignatures = await extractDocumentSignatures(
    pageState.pdfDoc2,
    function (pageNumber, totalPages) {
      showLoader(
        `Indexing PDF 2 page ${pageNumber} of ${totalPages}...`,
        50 + (pageNumber / Math.max(totalPages * 2, 1)) * 100
      );
    }
  );

  pageState.pagePairs = pairPages(leftSignatures, rightSignatures);
  pageState.currentPage = 1;
}

async function buildReportResults() {
  const results: ComparePageResult[] = [];

  for (const pair of pageState.pagePairs) {
    const cached = comparisonResultsCache.get(pair.pairIndex);
    if (cached) {
      results.push(cached);
      continue;
    }

    const leftSignatureKey = pair.leftPageNumber
      ? `left-${pair.leftPageNumber}`
      : '';
    const rightSignatureKey = pair.rightPageNumber
      ? `right-${pair.rightPageNumber}`
      : '';
    const cachedResult = comparisonCache.get(
      `${leftSignatureKey || 'none'}:${rightSignatureKey || 'none'}:${pageState.useOcr ? 'ocr' : 'no-ocr'}`
    );
    if (cachedResult) {
      results.push(cachedResult);
      continue;
    }

    const comparison = await computeComparisonForPair(pair);
    comparisonCache.set(
      `${leftSignatureKey || 'none'}:${rightSignatureKey || 'none'}:${pageState.useOcr ? 'ocr' : 'no-ocr'}`,
      comparison
    );
    comparisonResultsCache.set(pair.pairIndex, comparison);
    results.push(comparison);
  }

  return results;
}

async function renderBothPages() {
  if (!pageState.pdfDoc1 || !pageState.pdfDoc2) return;

  const pair = getActivePair();
  if (!pair) return;

  showLoader(
    `Loading comparison ${pageState.currentPage} of ${pageState.pagePairs.length}...`
  );

  const canvas1 = getElement<HTMLCanvasElement>(
    'canvas-compare-1'
  ) as HTMLCanvasElement;
  const canvas2 = getElement<HTMLCanvasElement>(
    'canvas-compare-2'
  ) as HTMLCanvasElement;
  const panel1 = getElement<HTMLElement>('panel-1') as HTMLElement;
  const panel2 = getElement<HTMLElement>('panel-2') as HTMLElement;
  const wrapper = getElement<HTMLElement>(
    'compare-viewer-wrapper'
  ) as HTMLElement;

  const container1 = panel1;
  const container2 = pageState.viewMode === 'overlay' ? panel1 : panel2;

  const comparison = await computeComparisonForPair(pair, {
    renderTargets: {
      left: {
        canvas: canvas1,
        container: container1,
        placeholderId: 'placeholder-1',
      },
      right: {
        canvas: canvas2,
        container: container2,
        placeholderId: 'placeholder-2',
      },
    },
  });

  pageState.currentComparison = comparison;
  pageState.activeChangeIndex = 0;

  updateNavControls();
  renderComparisonUI();
  hideLoader();
}

function updateNavControls() {
  const totalPairs =
    pageState.pagePairs.length ||
    Math.max(
      pageState.pdfDoc1?.numPages || 0,
      pageState.pdfDoc2?.numPages || 0
    );
  const currentDisplay = document.getElementById(
    'current-page-display-compare'
  );
  const totalDisplay = document.getElementById('total-pages-display-compare');
  const prevBtn = document.getElementById(
    'prev-page-compare'
  ) as HTMLButtonElement;
  const nextBtn = document.getElementById(
    'next-page-compare'
  ) as HTMLButtonElement;

  if (currentDisplay)
    currentDisplay.textContent = pageState.currentPage.toString();
  if (totalDisplay) totalDisplay.textContent = totalPairs.toString();
  if (prevBtn) prevBtn.disabled = pageState.currentPage <= 1;
  if (nextBtn) nextBtn.disabled = pageState.currentPage >= totalPairs;
}

function setViewMode(mode: 'overlay' | 'side-by-side') {
  pageState.viewMode = mode;
  const wrapper = document.getElementById('compare-viewer-wrapper');
  const overlayControls = document.getElementById('overlay-controls');
  const sideControls = document.getElementById('side-by-side-controls');
  const btnOverlay = document.getElementById('view-mode-overlay');
  const btnSide = document.getElementById('view-mode-side');
  const canvas2 = getElement<HTMLCanvasElement>(
    'canvas-compare-2'
  ) as HTMLCanvasElement;
  const opacitySlider = getElement<HTMLInputElement>(
    'opacity-slider'
  ) as HTMLInputElement;

  if (mode === 'overlay') {
    if (wrapper)
      wrapper.className =
        'compare-viewer-wrapper overlay-mode border border-slate-200';
    if (overlayControls) overlayControls.classList.remove('hidden');
    if (sideControls) sideControls.classList.add('hidden');
    if (btnOverlay) {
      btnOverlay.classList.add('bg-indigo-600');
      btnOverlay.classList.remove('bg-gray-700');
    }
    if (btnSide) {
      btnSide.classList.remove('bg-indigo-600');
      btnSide.classList.add('bg-gray-700');
    }
    if (canvas2 && opacitySlider) {
      const panel2 = getElement<HTMLElement>('panel-2');
      if (panel2) panel2.style.opacity = opacitySlider.value;
    }
    pageState.isSyncScroll = true;
  } else {
    if (wrapper)
      wrapper.className =
        'compare-viewer-wrapper side-by-side-mode border border-slate-200';
    if (overlayControls) overlayControls.classList.add('hidden');
    if (sideControls) sideControls.classList.remove('hidden');
    if (btnOverlay) {
      btnOverlay.classList.remove('bg-indigo-600');
      btnOverlay.classList.add('bg-gray-700');
    }
    if (btnSide) {
      btnSide.classList.add('bg-indigo-600');
      btnSide.classList.remove('bg-gray-700');
    }
    if (canvas2) canvas2.style.opacity = '1';
    const panel2 = getElement<HTMLElement>('panel-2');
    if (panel2) panel2.style.opacity = '1';
  }

  const p1 = getElement<HTMLElement>('panel-1');
  const p2 = getElement<HTMLElement>('panel-2');
  if (mode === 'overlay' && p1 && p2) {
    p2.scrollTop = p1.scrollTop;
    p2.scrollLeft = p1.scrollLeft;
  }

  if (pageState.pdfDoc1 && pageState.pdfDoc2) {
    renderBothPages();
  }
}

async function handleFileInput(
  inputId: string,
  docKey: 'pdfDoc1' | 'pdfDoc2',
  displayId: string
) {
  const fileInput = document.getElementById(inputId) as HTMLInputElement;
  const dropZone = document.getElementById(`drop-zone-${inputId.slice(-1)}`);

  async function handleFile(file: File) {
    if (!file || file.type !== 'application/pdf') {
      showAlert('Invalid File', 'Please select a valid PDF file.');
      return;
    }

    const displayDiv = document.getElementById(displayId);
    if (displayDiv) {
      displayDiv.innerHTML = '';

      const icon = document.createElement('i');
      icon.setAttribute('data-lucide', 'check-circle');
      icon.className = 'w-10 h-10 mb-3 text-green-500';

      const p = document.createElement('p');
      p.className = 'text-sm text-gray-300 truncate';
      p.textContent = file.name;

      if (docKey === 'pdfDoc1') documentNames.left = file.name;
      if (docKey === 'pdfDoc2') documentNames.right = file.name;

      const panelLabel1 = getElement<HTMLElement>('compare-panel-label-1');
      const panelLabel2 = getElement<HTMLElement>('compare-panel-label-2');
      if (docKey === 'pdfDoc1' && panelLabel1)
        panelLabel1.textContent = file.name;
      if (docKey === 'pdfDoc2' && panelLabel2)
        panelLabel2.textContent = file.name;

      displayDiv.append(icon, p);
      createIcons({ icons });
    }

    try {
      showLoader(`Loading ${file.name}...`);
      const arrayBuffer = await file.arrayBuffer();
      pageState[docKey] = await getPDFDocument({ data: arrayBuffer }).promise;
      pageModelCache.clear();
      comparisonCache.clear();
      comparisonResultsCache.clear();
      pageState.changeSearchQuery = '';

      const searchInput = getElement<HTMLInputElement>('compare-search-input');
      if (searchInput) {
        searchInput.value = '';
      }

      if (pageState.pdfDoc1 && pageState.pdfDoc2) {
        const compareViewer = document.getElementById('compare-viewer');
        if (compareViewer) compareViewer.classList.remove('hidden');
        await buildPagePairs();
        await renderBothPages();
      }
    } catch (e) {
      showAlert(
        'Error',
        'Could not load PDF. It may be corrupt or password-protected.'
      );
      console.error(e);
    } finally {
      hideLoader();
    }
  }

  if (fileInput) {
    fileInput.addEventListener('change', function (e) {
      const files = (e.target as HTMLInputElement).files;
      if (files && files[0]) handleFile(files[0]);
    });
  }

  if (dropZone) {
    dropZone.addEventListener('dragover', function (e) {
      e.preventDefault();
    });
    dropZone.addEventListener('drop', function (e) {
      e.preventDefault();
      const files = e.dataTransfer?.files;
      if (files && files[0]) handleFile(files[0]);
    });
  }
}

document.addEventListener('DOMContentLoaded', function () {
  const backBtn = getElement<HTMLButtonElement>('back-to-tools');

  if (backBtn) {
    backBtn.addEventListener('click', function () {
      window.location.href = import.meta.env.BASE_URL;
    });
  }

  handleFileInput('file-input-1', 'pdfDoc1', 'file-display-1');
  handleFileInput('file-input-2', 'pdfDoc2', 'file-display-2');

  const prevBtn = getElement<HTMLButtonElement>('prev-page-compare');
  const nextBtn = getElement<HTMLButtonElement>('next-page-compare');

  if (prevBtn) {
    prevBtn.addEventListener('click', function () {
      if (pageState.currentPage > 1) {
        pageState.currentPage--;
        renderBothPages();
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', function () {
      const totalPairs =
        pageState.pagePairs.length ||
        Math.max(
          pageState.pdfDoc1?.numPages || 0,
          pageState.pdfDoc2?.numPages || 0
        );
      if (pageState.currentPage < totalPairs) {
        pageState.currentPage++;
        renderBothPages();
      }
    });
  }

  const btnOverlay = getElement<HTMLButtonElement>('view-mode-overlay');
  const btnSide = getElement<HTMLButtonElement>('view-mode-side');

  if (btnOverlay) {
    btnOverlay.addEventListener('click', function () {
      setViewMode('overlay');
    });
  }

  if (btnSide) {
    btnSide.addEventListener('click', function () {
      setViewMode('side-by-side');
    });
  }

  const flickerBtn = getElement<HTMLButtonElement>('flicker-btn');
  const canvas2 = getElement<HTMLCanvasElement>(
    'canvas-compare-2'
  ) as HTMLCanvasElement;
  const opacitySlider = getElement<HTMLInputElement>(
    'opacity-slider'
  ) as HTMLInputElement;

  // Track flicker state
  let flickerVisible = true;

  if (flickerBtn) {
    flickerBtn.addEventListener('click', function () {
      flickerVisible = !flickerVisible;
      const p2 = getElement<HTMLElement>('panel-2');
      if (p2) {
        p2.style.transition = 'opacity 150ms ease-in-out';
        p2.style.opacity = flickerVisible ? opacitySlider?.value || '0.5' : '0';
      }
    });
  }

  if (opacitySlider) {
    opacitySlider.addEventListener('input', function () {
      flickerVisible = true;
      const p2 = getElement<HTMLElement>('panel-2');
      if (p2) {
        p2.style.transition = '';
        p2.style.opacity = opacitySlider.value;
      }
    });
  }

  const panel1 = getElement<HTMLElement>('panel-1');
  const panel2 = getElement<HTMLElement>('panel-2');
  const syncToggle = getElement<HTMLInputElement>(
    'sync-scroll-toggle'
  ) as HTMLInputElement;
  const prevChangeBtn = getElement<HTMLButtonElement>('prev-change-btn');
  const nextChangeBtn = getElement<HTMLButtonElement>('next-change-btn');
  const exportReportBtn = getElement<HTMLButtonElement>('export-report-btn');
  const ocrToggle = getElement<HTMLInputElement>('ocr-toggle');
  const searchInput = getElement<HTMLInputElement>('compare-search-input');

  const filterButtons: Array<{ id: string; filter: CompareFilterType }> = [
    { id: 'filter-modified', filter: 'modified' },
    { id: 'filter-added', filter: 'added' },
    { id: 'filter-removed', filter: 'removed' },
  ];

  if (syncToggle) {
    syncToggle.addEventListener('change', function () {
      pageState.isSyncScroll = syncToggle.checked;
    });
  }

  let scrollingPanel: HTMLElement | null = null;

  if (panel1 && panel2) {
    panel1.addEventListener('scroll', function () {
      if (pageState.isSyncScroll && scrollingPanel !== panel2) {
        scrollingPanel = panel1;
        panel2.scrollTop = panel1.scrollTop;
        panel2.scrollLeft = panel1.scrollLeft;
        setTimeout(function () {
          scrollingPanel = null;
        }, 100);
      }
    });

    panel2.addEventListener('scroll', function () {
      if (pageState.viewMode === 'overlay') return;
      if (pageState.isSyncScroll && scrollingPanel !== panel1) {
        scrollingPanel = panel2;
        panel1.scrollTop = panel2.scrollTop;
        panel1.scrollLeft = panel2.scrollLeft;
        setTimeout(function () {
          scrollingPanel = null;
        }, 100);
      }
    });
  }

  if (prevChangeBtn) {
    prevChangeBtn.addEventListener('click', function () {
      const changes = getVisibleChanges(pageState.currentComparison);
      if (changes.length === 0) return;
      pageState.activeChangeIndex =
        (pageState.activeChangeIndex - 1 + changes.length) % changes.length;
      renderComparisonUI();
      scrollToChange(changes[pageState.activeChangeIndex]);
    });
  }

  if (nextChangeBtn) {
    nextChangeBtn.addEventListener('click', function () {
      const changes = getVisibleChanges(pageState.currentComparison);
      if (changes.length === 0) return;
      pageState.activeChangeIndex =
        (pageState.activeChangeIndex + 1) % changes.length;
      renderComparisonUI();
      scrollToChange(changes[pageState.activeChangeIndex]);
    });
  }

  filterButtons.forEach(({ id, filter }) => {
    const button = getElement<HTMLButtonElement>(id);
    if (!button) return;
    button.addEventListener('click', function () {
      if (pageState.activeFilter === filter) {
        pageState.activeFilter = 'all';
      } else {
        pageState.activeFilter = filter;
      }
      pageState.activeChangeIndex = 0;
      renderComparisonUI();
    });
  });

  if (ocrToggle) {
    ocrToggle.checked = pageState.useOcr;
    ocrToggle.addEventListener('change', async function () {
      pageState.useOcr = ocrToggle.checked;
      pageModelCache.clear();
      comparisonCache.clear();
      comparisonResultsCache.clear();
      if (pageState.pdfDoc1 && pageState.pdfDoc2) {
        await renderBothPages();
      }
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', function () {
      pageState.changeSearchQuery = searchInput.value;
      pageState.activeChangeIndex = 0;
      renderComparisonUI();
    });
  }

  let resizeFrame = 0;
  window.addEventListener('resize', function () {
    if (!pageState.pdfDoc1 || !pageState.pdfDoc2) {
      return;
    }

    window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(function () {
      renderBothPages();
    });
  });

  if (exportReportBtn) {
    exportReportBtn.addEventListener('click', async function () {
      if (pageState.pagePairs.length === 0) return;
      showLoader('Building compare report...');
      const results = await buildReportResults();
      exportCompareHtmlReport(
        documentNames.left,
        documentNames.right,
        pageState.pagePairs,
        results
      );
      hideLoader();
    });
  }

  createIcons({ icons });
  updateFilterButtons();
  setViewMode(pageState.viewMode);
});
