import { ClassicPreset } from 'rete';
import { BaseWorkflowNode } from './base-node';
import { pdfSocket } from '../sockets';
import type { SocketData } from '../types';
import { requirePdfInput, processBatch } from '../types';
import { addTextWatermark } from '../../utils/pdf-operations';
import { PDFDocument } from 'pdf-lib';
import { hexToRgb } from '../../utils/helpers.js';

export class WatermarkNode extends BaseWorkflowNode {
  readonly category = 'Edit & Annotate' as const;
  readonly icon = 'ph-drop';
  readonly description = 'Add text watermark';

  constructor() {
    super('Watermark');
    this.addInput('pdf', new ClassicPreset.Input(pdfSocket, 'PDF'));
    this.addOutput(
      'pdf',
      new ClassicPreset.Output(pdfSocket, 'Watermarked PDF')
    );
    this.addControl(
      'text',
      new ClassicPreset.InputControl('text', { initial: 'DRAFT' })
    );
    this.addControl(
      'fontSize',
      new ClassicPreset.InputControl('number', { initial: 72 })
    );
    this.addControl(
      'color',
      new ClassicPreset.InputControl('text', { initial: '#808080' })
    );
    this.addControl(
      'opacity',
      new ClassicPreset.InputControl('number', { initial: 30 })
    );
    this.addControl(
      'angle',
      new ClassicPreset.InputControl('number', { initial: -45 })
    );
  }

  async data(
    inputs: Record<string, SocketData[]>
  ): Promise<Record<string, SocketData>> {
    const pdfInputs = requirePdfInput(inputs, 'Watermark');

    const getText = (key: string, fallback: string) => {
      const ctrl = this.controls[key] as
        | ClassicPreset.InputControl<'text'>
        | undefined;
      return ctrl?.value || fallback;
    };
    const getNum = (key: string, fallback: number) => {
      const ctrl = this.controls[key] as
        | ClassicPreset.InputControl<'number'>
        | undefined;
      return ctrl?.value ?? fallback;
    };

    const colorHex = getText('color', '#808080');
    const c = hexToRgb(colorHex);

    const watermarkText = getText('text', 'DRAFT');
    const fontSize = getNum('fontSize', 72);
    const opacity = getNum('opacity', 30) / 100;
    const angle = getNum('angle', -45);

    return {
      pdf: await processBatch(pdfInputs, async (input) => {
        const resultBytes = await addTextWatermark(input.bytes, {
          text: watermarkText,
          fontSize,
          color: { r: c.r, g: c.g, b: c.b },
          opacity,
          angle,
        });

        const resultDoc = await PDFDocument.load(resultBytes);

        return {
          type: 'pdf',
          document: resultDoc,
          bytes: resultBytes,
          filename: input.filename.replace(/\.pdf$/i, '_watermarked.pdf'),
        };
      }),
    };
  }
}
