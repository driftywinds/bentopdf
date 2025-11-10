// TODO@ALAM - USE CPDF HERE

// import { showLoader, hideLoader, showAlert } from '../ui.js';
// import { downloadFile, readFileAsArrayBuffer } from '../utils/helpers.js';
// import { state } from '../state.js';
// import { PDFDocument as PDFLibDocument } from 'pdf-lib';

// let currentAttachments: Array<{ name: string; index: number; size: number }> = [];
// let attachmentsToRemove: Set<number> = new Set();
// let attachmentsToReplace: Map<number, File> = new Map();

// export async function setupEditAttachmentsTool() {
//   const optionsDiv = document.getElementById('edit-attachments-options');
//   if (!optionsDiv || !state.pdfDoc) return;

//   optionsDiv.classList.remove('hidden');
//   await loadAttachmentsList();
// }

// async function loadAttachmentsList() {
//   const attachmentsList = document.getElementById('attachments-list');
//   if (!attachmentsList || !state.pdfDoc) return;

//   attachmentsList.innerHTML = '';
//   currentAttachments = [];
//   attachmentsToRemove.clear();
//   attachmentsToReplace.clear();

//   try {
//     // Get embedded files from PDF
//     const embeddedFiles = state.pdfDoc.context.enumerateIndirectObjects()
//       .filter(([ref, obj]: any) => {
//         const dict = obj instanceof PDFLibDocument.context.dict ? obj : null;
//         return dict && dict.get('Type')?.toString() === '/Filespec';
//       });

//     if (embeddedFiles.length === 0) {
//       attachmentsList.innerHTML = '<p class="text-gray-400 text-center py-4">No attachments found in this PDF.</p>';
//       return;
//     }

//     let index = 0;
//     for (const [ref, fileSpec] of embeddedFiles) {
//       try {
//         const fileSpecDict = fileSpec as any;
//         const fileName = fileSpecDict.get('UF')?.decodeText() || 
//                         fileSpecDict.get('F')?.decodeText() || 
//                         `attachment-${index + 1}`;
        
//         const ef = fileSpecDict.get('EF');
//         let fileSize = 0;
//         if (ef) {
//           const fRef = ef.get('F') || ef.get('UF');
//           if (fRef) {
//             const fileStream = state.pdfDoc.context.lookup(fRef);
//             if (fileStream) {
//               fileSize = (fileStream as any).getContents().length;
//             }
//           }
//         }

//         currentAttachments.push({ name: fileName, index, size: fileSize });

//         const attachmentDiv = document.createElement('div');
//         attachmentDiv.className = 'flex items-center justify-between p-3 bg-gray-800 rounded-lg border border-gray-700';
//         attachmentDiv.dataset.attachmentIndex = index.toString();

//         const infoDiv = document.createElement('div');
//         infoDiv.className = 'flex-1';
//         const nameSpan = document.createElement('span');
//         nameSpan.className = 'text-white font-medium block';
//         nameSpan.textContent = fileName;
//         const sizeSpan = document.createElement('span');
//         sizeSpan.className = 'text-gray-400 text-sm';
//         sizeSpan.textContent = `${Math.round(fileSize / 1024)} KB`;
//         infoDiv.append(nameSpan, sizeSpan);

//         const actionsDiv = document.createElement('div');
//         actionsDiv.className = 'flex items-center gap-2';

//         // Remove button
//         const removeBtn = document.createElement('button');
//         removeBtn.className = 'btn bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm';
//         removeBtn.innerHTML = '<i data-lucide="trash-2" class="w-4 h-4"></i>';
//         removeBtn.title = 'Remove attachment';
//         removeBtn.onclick = () => {
//           attachmentsToRemove.add(index);
//           attachmentDiv.classList.add('opacity-50', 'line-through');
//           removeBtn.disabled = true;
//         };

//         // Replace button
//         const replaceBtn = document.createElement('button');
//         replaceBtn.className = 'btn bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded text-sm';
//         replaceBtn.innerHTML = '<i data-lucide="refresh-cw" class="w-4 h-4"></i>';
//         replaceBtn.title = 'Replace attachment';
//         replaceBtn.onclick = () => {
//           const input = document.createElement('input');
//           input.type = 'file';
//           input.onchange = async (e) => {
//             const file = (e.target as HTMLInputElement).files?.[0];
//             if (file) {
//               attachmentsToReplace.set(index, file);
//               nameSpan.textContent = `${fileName} → ${file.name}`;
//               nameSpan.classList.add('text-yellow-400');
//             }
//           };
//           input.click();
//         };

//         actionsDiv.append(replaceBtn, removeBtn);
//         attachmentDiv.append(infoDiv, actionsDiv);
//         attachmentsList.appendChild(attachmentDiv);
//         index++;
//       } catch (e) {
//         console.warn(`Failed to process attachment ${index}:`, e);
//         index++;
//       }
//     }
//   } catch (e) {
//     console.error('Error loading attachments:', e);
//     showAlert('Error', 'Failed to load attachments from PDF.');
//   }
// }

// export async function editAttachments() {
//   if (!state.pdfDoc) {
//     showAlert('Error', 'PDF is not loaded.');
//     return;
//   }

//   showLoader('Updating attachments...');
//   try {
//     // Create a new PDF document
//     const newPdfDoc = await PDFLibDocument.create();
    
//     // Copy all pages
//     const pages = await newPdfDoc.copyPages(state.pdfDoc, state.pdfDoc.getPageIndices());
//     pages.forEach((page: any) => newPdfDoc.addPage(page));

//     // Handle attachments
//     const embeddedFiles = state.pdfDoc.context.enumerateIndirectObjects()
//       .filter(([ref, obj]: any) => {
//         const dict = obj instanceof PDFLibDocument.context.dict ? obj : null;
//         return dict && dict.get('Type')?.toString() === '/Filespec';
//       });

//     let attachmentIndex = 0;
//     for (const [ref, fileSpec] of embeddedFiles) {
//       if (attachmentsToRemove.has(attachmentIndex)) {
//         attachmentIndex++;
//         continue; // Skip removed attachments
//       }

//       if (attachmentsToReplace.has(attachmentIndex)) {
//         // Replace attachment
//         const replacementFile = attachmentsToReplace.get(attachmentIndex)!;
//         const fileBytes = await readFileAsArrayBuffer(replacementFile);
//         await newPdfDoc.attach(fileBytes as ArrayBuffer, replacementFile.name, {
//           mimeType: replacementFile.type || 'application/octet-stream',
//           description: `Attached file: ${replacementFile.name}`,
//           creationDate: new Date(),
//           modificationDate: new Date(replacementFile.lastModified),
//         });
//       } else {
//         // Keep existing attachment - copy it
//         try {
//           const fileSpecDict = fileSpec as any;
//           const fileName = fileSpecDict.get('UF')?.decodeText() || 
//                           fileSpecDict.get('F')?.decodeText() || 
//                           `attachment-${attachmentIndex + 1}`;
          
//           const ef = fileSpecDict.get('EF');
//           if (ef) {
//             const fRef = ef.get('F') || ef.get('UF');
//             if (fRef) {
//               const fileStream = state.pdfDoc.context.lookup(fRef);
//               if (fileStream) {
//                 const fileData = (fileStream as any).getContents();
//                 await newPdfDoc.attach(fileData, fileName, {
//                   mimeType: 'application/octet-stream',
//                   description: `Attached file: ${fileName}`,
//                 });
//               }
//             }
//           }
//         } catch (e) {
//           console.warn(`Failed to copy attachment ${attachmentIndex}:`, e);
//         }
//       }
//       attachmentIndex++;
//     }

//     const pdfBytes = await newPdfDoc.save();
//     downloadFile(
//       new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' }),
//       `edited-attachments-${state.files[0].name}`
//     );
//     showAlert('Success', 'Attachments updated successfully!');
//   } catch (e) {
//     console.error(e);
//     showAlert('Error', 'Failed to edit attachments.');
//   } finally {
//     hideLoader();
//   }
// }

