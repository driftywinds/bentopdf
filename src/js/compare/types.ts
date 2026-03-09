import type * as pdfjsLib from 'pdfjs-dist';

export type CompareViewMode = 'overlay' | 'side-by-side';

export interface CompareRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CharPosition {
  x: number;
  width: number;
}

export interface CompareWordToken {
  word: string;
  compareWord: string;
  rect: CompareRectangle;
  joinsWithPrevious?: boolean;
}

export interface CompareTextItem {
  id: string;
  text: string;
  normalizedText: string;
  rect: CompareRectangle;
  fragments?: CompareTextItem[];
  charMap?: CharPosition[];
  wordTokens?: CompareWordToken[];
}

export interface ComparePageModel {
  pageNumber: number;
  width: number;
  height: number;
  textItems: CompareTextItem[];
  plainText: string;
  hasText: boolean;
  source: 'pdfjs' | 'ocr';
}

export interface ComparePageSignature {
  pageNumber: number;
  plainText: string;
  hasText: boolean;
  tokenItems: CompareTextItem[];
}

export interface ComparePagePair {
  pairIndex: number;
  leftPageNumber: number | null;
  rightPageNumber: number | null;
  confidence: number;
}

export interface CompareVisualDiff {
  mismatchPixels: number;
  mismatchRatio: number;
  hasDiff: boolean;
}

export type CompareChangeType =
  | 'added'
  | 'removed'
  | 'modified'
  | 'page-added'
  | 'page-removed';

export interface CompareTextChange {
  id: string;
  type: CompareChangeType;
  description: string;
  beforeText: string;
  afterText: string;
  beforeRects: CompareRectangle[];
  afterRects: CompareRectangle[];
}

export interface CompareChangeSummary {
  added: number;
  removed: number;
  modified: number;
}

export interface ComparePageResult {
  status: 'match' | 'changed' | 'left-only' | 'right-only';
  leftPageNumber: number | null;
  rightPageNumber: number | null;
  changes: CompareTextChange[];
  summary: CompareChangeSummary;
  visualDiff: CompareVisualDiff | null;
  confidence?: number;
  usedOcr?: boolean;
}

export type CompareFilterType = 'added' | 'removed' | 'modified' | 'all';

export interface CompareState {
  pdfDoc1: pdfjsLib.PDFDocumentProxy | null;
  pdfDoc2: pdfjsLib.PDFDocumentProxy | null;
  currentPage: number;
  viewMode: CompareViewMode;
  isSyncScroll: boolean;
  currentComparison: ComparePageResult | null;
  activeChangeIndex: number;
  pagePairs: ComparePagePair[];
  activeFilter: CompareFilterType;
  changeSearchQuery: string;
  useOcr: boolean;
  ocrLanguage: string;
}
