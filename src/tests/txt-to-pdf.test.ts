import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { txtToPdf, setupTxtToPdfTool } from '@/js/logic/txt-to-pdf';
import * as ui from '@/js/ui';
import * as helpers from '@/js/utils/helpers';
import { state } from '@/js/state';
import { PDFDocument as PDFLibDocument } from 'pdf-lib';

// Mocks
vi.mock('@/js/ui', () => ({
    showLoader: vi.fn(),
    hideLoader: vi.fn(),
    showAlert: vi.fn(),
}));

vi.mock('@/js/utils/helpers', () => ({
    downloadFile: vi.fn(),
    hexToRgb: vi.fn(() => ({ r: 0, g: 0, b: 0 })),
}));

vi.mock('pdf-lib', () => ({
    PDFDocument: {
        create: vi.fn(),
    },
    StandardFonts: {
        Helvetica: 'Helvetica',
    },
    PageSizes: {
        A4: [595.28, 841.89],
    },
    rgb: vi.fn(),
}));

vi.mock('jszip', () => {
    return {
        default: vi.fn().mockImplementation(() => ({
            file: vi.fn(),
            generateAsync: vi.fn().mockResolvedValue(new Blob()),
        })),
    };
});

describe('Text to PDF Tool', () => {
    let mockPdfDoc: any;
    let mockPage: any;
    let mockFont: any;

    beforeEach(() => {
        document.body.innerHTML = `
      <button id="txt-mode-upload-btn"></button>
      <button id="txt-mode-text-btn"></button>
      <div id="txt-upload-panel"></div>
      <div id="txt-text-panel" class="hidden"></div>
      <button id="process-btn"></button>
      <select id="font-family"><option value="Helvetica">Helvetica</option></select>
      <input id="font-size" value="12" />
      <select id="page-size"><option value="A4">A4</option></select>
      <input id="text-color" value="#000000" />
      <textarea id="text-input"></textarea>
    `;

        mockPage = {
            getSize: vi.fn(() => ({ width: 595.28, height: 841.89 })),
            drawText: vi.fn(),
            getHeight: vi.fn(() => 841.89),
        };

        mockFont = {
            widthOfTextAtSize: vi.fn(() => 10),
        };

        mockPdfDoc = {
            embedFont: vi.fn().mockResolvedValue(mockFont),
            addPage: vi.fn(() => mockPage),
            save: vi.fn().mockResolvedValue(new Uint8Array([])),
        };

        vi.mocked(PDFLibDocument.create).mockResolvedValue(mockPdfDoc);
        state.files = [];
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('setupTxtToPdfTool should attach onclick listener to process-btn', async () => {
        const processBtn = document.getElementById('process-btn');
        expect(processBtn?.onclick).toBeNull();

        await setupTxtToPdfTool();

        expect(processBtn?.onclick).toBeDefined();
    });

    it('txtToPdf should handle text input mode', async () => {
        // Switch to text mode (simulate UI state)
        document.getElementById('txt-upload-panel')?.classList.add('hidden');
        document.getElementById('txt-text-panel')?.classList.remove('hidden');
        (document.getElementById('text-input') as HTMLTextAreaElement).value = 'Hello World';

        await txtToPdf();

        expect(ui.showLoader).toHaveBeenCalled();
        expect(PDFLibDocument.create).toHaveBeenCalled();
        expect(mockPdfDoc.addPage).toHaveBeenCalled();
        expect(mockPage.drawText).toHaveBeenCalled();
        expect(helpers.downloadFile).toHaveBeenCalled();
        expect(ui.hideLoader).toHaveBeenCalled();
    });

    it('txtToPdf should show alert if text input is empty', async () => {
        document.getElementById('txt-upload-panel')?.classList.add('hidden');
        document.getElementById('txt-text-panel')?.classList.remove('hidden');
        (document.getElementById('text-input') as HTMLTextAreaElement).value = '   ';

        await txtToPdf();

        expect(ui.showAlert).toHaveBeenCalledWith('Input Required', 'Please enter some text to convert.');
        expect(PDFLibDocument.create).not.toHaveBeenCalled();
    });
});
