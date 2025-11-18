self.importScripts('/coherentpdf.browser.min.js');

function addAttachmentsToPDFInWorker(pdfBuffer, attachmentBuffers, attachmentNames) {
  try {
    const uint8Array = new Uint8Array(pdfBuffer);
    
    let pdf;
    try {
      pdf = coherentpdf.fromMemory(uint8Array, '');
    } catch (error) {
      self.postMessage({
        status: 'error',
        message: `Failed to load PDF. Error: ${error.message || error}`
      });
      return;
    }

    // Add each attachment to the PDF
    for (let i = 0; i < attachmentBuffers.length; i++) {
      try {
        const attachmentData = new Uint8Array(attachmentBuffers[i]);
        const attachmentName = attachmentNames[i];
        
        // Attach file at document level (page 0)
        coherentpdf.attachFileFromMemory(attachmentData, attachmentName, pdf);
      } catch (error) {
        console.warn(`Failed to attach file ${attachmentNames[i]}:`, error);
        self.postMessage({
          status: 'error',
          message: `Failed to attach file ${attachmentNames[i]}: ${error.message || error}`
        });
        coherentpdf.deletePdf(pdf);
        return;
      }
    }
    
    // Save the modified PDF
    const modifiedBytes = coherentpdf.toMemory(pdf, false, false);
    coherentpdf.deletePdf(pdf);

    const buffer = modifiedBytes.buffer.slice(
      modifiedBytes.byteOffset, 
      modifiedBytes.byteOffset + modifiedBytes.byteLength
    );

    self.postMessage({
      status: 'success',
      modifiedPDF: buffer
    }, [buffer]);
    
  } catch (error) {
    self.postMessage({
      status: 'error',
      message: error instanceof Error
        ? error.message
        : 'Unknown error occurred while adding attachments.'
    });
  }
}

self.onmessage = (e) => {
  if (e.data.command === 'add-attachments') {
    addAttachmentsToPDFInWorker(
      e.data.pdfBuffer, 
      e.data.attachmentBuffers, 
      e.data.attachmentNames
    );
  }
};
