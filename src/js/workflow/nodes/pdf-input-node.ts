import { ClassicPreset } from 'rete';
import { BaseWorkflowNode } from './base-node';
import { pdfSocket } from '../sockets';
import type { PDFData, SocketData, MultiPDFData } from '../types';
import { PDFDocument } from 'pdf-lib';
import { readFileAsArrayBuffer } from '../../utils/helpers.js';

export class PDFInputNode extends BaseWorkflowNode {
  readonly category = 'Input' as const;
  readonly icon = 'ph-file-pdf';
  readonly description = 'Upload one or more PDF files';

  private files: PDFData[] = [];

  constructor() {
    super('PDF Input');
    this.addOutput('pdf', new ClassicPreset.Output(pdfSocket, 'PDF'));
  }

  async addFile(file: File): Promise<void> {
    const arrayBuffer = await readFileAsArrayBuffer(file);
    const bytes = new Uint8Array(arrayBuffer as ArrayBuffer);
    const document = await PDFDocument.load(bytes, {
      ignoreEncryption: true,
      throwOnInvalidObject: false,
    });
    this.files.push({
      type: 'pdf',
      document,
      bytes,
      filename: file.name,
    });
  }

  async setFile(file: File): Promise<void> {
    this.files = [];
    await this.addFile(file);
  }

  async setFiles(fileList: File[]): Promise<void> {
    this.files = [];
    for (const file of fileList) {
      await this.addFile(file);
    }
  }

  removeFile(index: number): void {
    this.files.splice(index, 1);
  }

  hasFile(): boolean {
    return this.files.length > 0;
  }

  getFileCount(): number {
    return this.files.length;
  }

  getFilenames(): string[] {
    return this.files.map((f) => f.filename);
  }

  getFilename(): string {
    if (this.files.length === 0) return '';
    if (this.files.length === 1) return this.files[0].filename;
    return `${this.files.length} files`;
  }

  async data(
    _inputs: Record<string, SocketData[]>
  ): Promise<Record<string, SocketData>> {
    if (this.files.length === 0) {
      throw new Error('No PDF files uploaded in PDF Input node');
    }

    if (this.files.length === 1) {
      return { pdf: this.files[0] };
    }

    const multiData: MultiPDFData = {
      type: 'multi-pdf',
      items: this.files,
    };
    return { pdf: multiData };
  }
}
