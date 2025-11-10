// TODO@ALAM - USE CPDF HERE

// import { showLoader, hideLoader, showAlert } from '../ui.js';
// import { downloadFile, readFileAsArrayBuffer } from '../utils/helpers.js';
// import { state } from '../state.js';
// import { PDFDocument as PDFLibDocument } from 'pdf-lib';
// import JSZip from 'jszip';

// export async function extractAttachments() {
//   if (state.files.length === 0) {
//     showAlert('No Files', 'Please select at least one PDF file.');
//     return;
//   }

//   showLoader('Extracting attachments...');
//   try {
//     const zip = new JSZip();
//     let totalAttachments = 0;

//     for (const file of state.files) {
//       const pdfBytes = await readFileAsArrayBuffer(file);
//       const pdfDoc = await PDFLibDocument.load(pdfBytes as ArrayBuffer, {
//         ignoreEncryption: true,
//       });

//       const embeddedFiles = pdfDoc.context.enumerateIndirectObjects()
//         .filter(([ref, obj]: any) => {
//           // obj must be a PDFDict
//           if (obj && typeof obj.get === 'function') {
//             const type = obj.get('Type');
//             return type && type.toString() === '/Filespec';
//           }
//           return false;
//         });

//       if (embeddedFiles.length === 0) {
//         console.warn(`No attachments found in ${file.name}`);
//         continue;
//       }

//       // Extract attachments
//       const baseName = file.name.replace(/\.pdf$/i, '');
//       for (let i = 0; i < embeddedFiles.length; i++) {
//         try {
//           const [ref, fileSpec] = embeddedFiles[i];
//           const fileSpecDict = fileSpec as any;
          
//           // Get attachment name
//           const fileName = fileSpecDict.get('UF')?.decodeText() || 
//                          fileSpecDict.get('F')?.decodeText() || 
//                          `attachment-${i + 1}`;
          
//           // Get embedded file stream
//           const ef = fileSpecDict.get('EF');
//           if (ef) {
//             const fRef = ef.get('F') || ef.get('UF');
//             if (fRef) {
//               const fileStream = pdfDoc.context.lookup(fRef);
//               if (fileStream) {
//                 const fileData = (fileStream as any).getContents();
//                 zip.file(`${baseName}_${fileName}`, fileData);
//                 totalAttachments++;
//               }
//             }
//           }
//         } catch (e) {
//           console.warn(`Failed to extract attachment ${i} from ${file.name}:`, e);
//         }
//       }
//     }

//     if (totalAttachments === 0) {
//       showAlert('No Attachments', 'No attachments were found in the selected PDF(s).');
//       hideLoader();
//       return;
//     }

//     const zipBlob = await zip.generateAsync({ type: 'blob' });
//     downloadFile(zipBlob, 'extracted-attachments.zip');
//     showAlert('Success', `Extracted ${totalAttachments} attachment(s) successfully!`);
//   } catch (e) {
//     console.error(e);
//     showAlert('Error', 'Failed to extract attachments. The PDF may not contain attachments or may be corrupted.');
//   } finally {
//     hideLoader();
//   }
// }

