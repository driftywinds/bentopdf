import { showLoader, hideLoader, showAlert } from '../ui.js';
import {
  downloadFile,
  initializeQpdf,
  readFileAsArrayBuffer,
} from '../utils/helpers.js';
import { state } from '../state.js';

export async function removeRestrictions() {
  const file = state.files[0];
  const password =
    (document.getElementById('owner-password-remove') as HTMLInputElement)
      ?.value || '';

  const inputPath = '/input.pdf';
  const outputPath = '/output.pdf';
  let qpdf: any;

  try {
    showLoader('Initializing...');
    qpdf = await initializeQpdf();

    showLoader('Reading PDF...');
    const fileBuffer = await readFileAsArrayBuffer(file);
    const uint8Array = new Uint8Array(fileBuffer as ArrayBuffer);

    qpdf.FS.writeFile(inputPath, uint8Array);

    showLoader('Removing restrictions...');

    const args = [inputPath];

    if (password) {
      args.push(`--password=${password}`);
    }

    args.push('--decrypt', '--remove-restrictions', '--', outputPath);

    try {
      qpdf.callMain(args);
    } catch (qpdfError: any) {
      console.error('qpdf execution error:', qpdfError);
      if (
        qpdfError.message?.includes('password') ||
        qpdfError.message?.includes('encrypt')
      ) {
        throw new Error(
          'Failed to remove restrictions. The PDF may require the correct owner password.'
        );
      }

      throw new Error(
        'Failed to remove restrictions: ' +
          (qpdfError.message || 'Unknown error')
      );
    }

    showLoader('Preparing download...');
    const outputFile = qpdf.FS.readFile(outputPath, { encoding: 'binary' });

    if (!outputFile || outputFile.length === 0) {
      throw new Error('Operation resulted in an empty file.');
    }

    const blob = new Blob([outputFile], { type: 'application/pdf' });
    downloadFile(blob, `unrestricted-${file.name}`);

    hideLoader();

    showAlert(
      'Success',
      'PDF restrictions removed successfully! The file is now fully editable and printable.'
    );
  } catch (error: any) {
    console.error('Error during restriction removal:', error);
    hideLoader();
    showAlert(
      'Operation Failed',
      `An error occurred: ${error.message || 'The PDF might be corrupted or password-protected.'}`
    );
  } finally {
    try {
      if (qpdf?.FS) {
        try {
          qpdf.FS.unlink(inputPath);
        } catch (e) {
          console.warn('Failed to unlink input file:', e);
        }
        try {
          qpdf.FS.unlink(outputPath);
        } catch (e) {
          console.warn('Failed to unlink output file:', e);
        }
      }
    } catch (cleanupError) {
      console.warn('Failed to cleanup WASM FS:', cleanupError);
    }
  }
}
