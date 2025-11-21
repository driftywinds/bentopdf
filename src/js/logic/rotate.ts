import { showLoader, hideLoader, showAlert } from '../ui.js';
import { downloadFile } from '../utils/helpers.js';
import { state } from '../state.js';
import { getRotationState } from '../handlers/fileHandler.js';

import { degrees } from 'pdf-lib';

export async function rotate() {
  showLoader('Applying rotations...');
  try {
    const pages = state.pdfDoc.getPages();
    const rotationStateArray = getRotationState();

    // Apply rotations from state (not DOM) to ensure all pages including lazy-loaded ones are rotated
    rotationStateArray.forEach((rotation, pageIndex) => {
      if (rotation !== 0 && pages[pageIndex]) {
        const currentRotation = pages[pageIndex].getRotation().angle;
        pages[pageIndex].setRotation(degrees(currentRotation + rotation));
      }
    });

    const rotatedPdfBytes = await state.pdfDoc.save();
    downloadFile(
      new Blob([rotatedPdfBytes], { type: 'application/pdf' }),
      'rotated.pdf'
    );
  } catch (e) {
    console.error(e);
    showAlert('Error', 'Could not apply rotations.');
  } finally {
    hideLoader();
  }
}
