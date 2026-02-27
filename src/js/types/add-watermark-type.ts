import { PDFDocument as PDFLibDocument } from 'pdf-lib';

export interface AddWatermarkState {
  file: File | null;
  pdfDoc: PDFLibDocument | null;
  pdfBytes: Uint8Array | null;
  previewCanvas: HTMLCanvasElement | null;
  watermarkX: number; // 0–1, percentage from left
  watermarkY: number; // 0–1, percentage from top (flipped to bottom for PDF)
}
