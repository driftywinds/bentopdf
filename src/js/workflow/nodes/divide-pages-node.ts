import { ClassicPreset } from 'rete';
import { BaseWorkflowNode } from './base-node';
import { pdfSocket } from '../sockets';
import type { SocketData } from '../types';
import { requirePdfInput, processBatch } from '../types';
import { PDFDocument } from 'pdf-lib';

export class DividePagesNode extends BaseWorkflowNode {
  readonly category = 'Organize & Manage' as const;
  readonly icon = 'ph-columns';
  readonly description = 'Split pages vertically or horizontally';

  constructor() {
    super('Divide Pages');
    this.addInput('pdf', new ClassicPreset.Input(pdfSocket, 'PDF'));
    this.addOutput('pdf', new ClassicPreset.Output(pdfSocket, 'Divided PDF'));
    this.addControl(
      'direction',
      new ClassicPreset.InputControl('text', { initial: 'vertical' })
    );
  }

  async data(
    inputs: Record<string, SocketData[]>
  ): Promise<Record<string, SocketData>> {
    const pdfInputs = requirePdfInput(inputs, 'Divide Pages');
    const dirCtrl = this.controls['direction'] as
      | ClassicPreset.InputControl<'text'>
      | undefined;
    const direction =
      dirCtrl?.value === 'horizontal' ? 'horizontal' : 'vertical';

    return {
      pdf: await processBatch(pdfInputs, async (input) => {
        const srcDoc = await PDFDocument.load(input.bytes);
        const newDoc = await PDFDocument.create();
        for (let i = 0; i < srcDoc.getPageCount(); i++) {
          const [page1] = await newDoc.copyPages(srcDoc, [i]);
          const [page2] = await newDoc.copyPages(srcDoc, [i]);
          const { width, height } = page1.getSize();
          if (direction === 'vertical') {
            page1.setCropBox(0, 0, width / 2, height);
            page2.setCropBox(width / 2, 0, width / 2, height);
          } else {
            page1.setCropBox(0, height / 2, width, height / 2);
            page2.setCropBox(0, 0, width, height / 2);
          }
          newDoc.addPage(page1);
          newDoc.addPage(page2);
        }
        const pdfBytes = await newDoc.save();
        return {
          type: 'pdf',
          document: newDoc,
          bytes: new Uint8Array(pdfBytes),
          filename: input.filename.replace(/\.pdf$/i, '_divided.pdf'),
        };
      }),
    };
  }
}
