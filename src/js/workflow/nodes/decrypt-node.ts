import { ClassicPreset } from 'rete';
import { BaseWorkflowNode } from './base-node';
import { pdfSocket } from '../sockets';
import type { SocketData } from '../types';
import { requirePdfInput, processBatch } from '../types';
import { PDFDocument } from 'pdf-lib';
import { initializeQpdf } from '../../utils/helpers.js';

export class DecryptNode extends BaseWorkflowNode {
  readonly category = 'Secure PDF' as const;
  readonly icon = 'ph-lock-open';
  readonly description = 'Remove PDF password protection';

  constructor() {
    super('Decrypt');
    this.addInput('pdf', new ClassicPreset.Input(pdfSocket, 'PDF'));
    this.addOutput('pdf', new ClassicPreset.Output(pdfSocket, 'Decrypted PDF'));
    this.addControl(
      'password',
      new ClassicPreset.InputControl('text', { initial: '' })
    );
  }

  async data(
    inputs: Record<string, SocketData[]>
  ): Promise<Record<string, SocketData>> {
    const pdfInputs = requirePdfInput(inputs, 'Decrypt');

    const passCtrl = this.controls['password'] as
      | ClassicPreset.InputControl<'text'>
      | undefined;
    const password = passCtrl?.value || '';

    return {
      pdf: await processBatch(pdfInputs, async (input) => {
        const qpdf = await initializeQpdf();
        const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const inputPath = `/tmp/input_decrypt_${uid}.pdf`;
        const outputPath = `/tmp/output_decrypt_${uid}.pdf`;

        let decryptedData: Uint8Array;
        try {
          qpdf.FS.writeFile(inputPath, input.bytes);
          const args = password
            ? [inputPath, '--password=' + password, '--decrypt', outputPath]
            : [inputPath, '--decrypt', outputPath];
          qpdf.callMain(args);

          decryptedData = qpdf.FS.readFile(outputPath, { encoding: 'binary' });
        } finally {
          try {
            qpdf.FS.unlink(inputPath);
          } catch {
            /* cleanup */
          }
          try {
            qpdf.FS.unlink(outputPath);
          } catch {
            /* cleanup */
          }
        }

        const resultBytes = new Uint8Array(decryptedData);
        const document = await PDFDocument.load(resultBytes);

        return {
          type: 'pdf',
          document,
          bytes: resultBytes,
          filename: input.filename.replace(/\.pdf$/i, '_decrypted.pdf'),
        };
      }),
    };
  }
}
