import { showLoader, hideLoader, showAlert } from '../ui.js';
import { readFileAsArrayBuffer } from '../utils/helpers.js';
import { state } from '../state.js';

const signState = {
  viewerIframe: null,
  viewerReady: false,
};


export async function setupSignTool() {
  document.getElementById('signature-editor').classList.remove('hidden');

  showLoader('Loading PDF viewer...');

  const container = document.getElementById('canvas-container-sign');
  if (!container) {
    console.error('Sign tool canvas container not found');
    hideLoader();
    return;
  }

  if (!state.files || !state.files[0]) {
    console.error('No file loaded into state for signing');
    hideLoader();
    return;
  }

  container.textContent = '';
  const iframe = document.createElement('iframe');
  iframe.style.width = '100%';
  iframe.style.height = '100%';
  iframe.style.border = 'none';
  container.appendChild(iframe);
  signState.viewerIframe = iframe;

  // Use original uploaded bytes to avoid re-writing the PDF structure
  const file = state.files[0];
  const pdfBytes = await readFileAsArrayBuffer(file);
  const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
  const blobUrl = URL.createObjectURL(blob);

  const viewerBase = '/pdfjs-viewer/viewer.html';
  const query = new URLSearchParams({ file: blobUrl });
  iframe.src = `${viewerBase}?${query.toString()}`;

  iframe.onload = () => {
    hideLoader();
    signState.viewerReady = true;
    try {
      const viewerWindow: any = iframe.contentWindow;
      if (viewerWindow && viewerWindow.PDFViewerApplication) {
        const app = viewerWindow.PDFViewerApplication;
        const doc = viewerWindow.document;

        const editorModeButtons = doc.getElementById('editorModeButtons');
        editorModeButtons?.classList.remove('hidden');

        const editorSignature = doc.getElementById('editorSignature');
        editorSignature?.removeAttribute('hidden');
        const editorSignatureButton = doc.getElementById('editorSignatureButton') as HTMLButtonElement | null;
        if (editorSignatureButton) {
          editorSignatureButton.disabled = false;
        }

        const editorStamp = doc.getElementById('editorStamp');
        editorStamp?.removeAttribute('hidden');
        const editorStampButton = doc.getElementById('editorStampButton') as HTMLButtonElement | null;
        if (editorStampButton) {
          editorStampButton.disabled = false;
        }
      }
    } catch (e) {
      console.error('Could not initialize base PDF.js viewer for signing:', e);
    }

    // Now that the viewer is ready, expose the Save Signed PDF button in the Bento UI
    const saveBtn = document.getElementById('process-btn') as HTMLButtonElement | null;
    if (saveBtn) {
      saveBtn.style.display = '';
      saveBtn.disabled = false;
      saveBtn.onclick = () => {
        void applyAndSaveSignatures();
      };
    }
  };
}

export async function applyAndSaveSignatures() {
  if (!signState.viewerReady || !signState.viewerIframe) {
    showAlert('Viewer not ready', 'Please wait for the PDF viewer to load.');
    return;
  }

  try {
    const viewerWindow: any = signState.viewerIframe.contentWindow;
    if (!viewerWindow || !viewerWindow.PDFViewerApplication) {
      showAlert('Viewer not ready', 'The PDF viewer is still initializing.');
      return;
    }

    // Delegate to the built-in download behavior of the base viewer.
    const app = viewerWindow.PDFViewerApplication;
    app.eventBus?.dispatch('download', { source: app });
  } catch (error) {
    console.error('Failed to trigger download in base PDF.js viewer:', error);
    showAlert('Export failed', 'Could not export the signed PDF. Please try again.');
  }
}
