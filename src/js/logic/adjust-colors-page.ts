import { showLoader, hideLoader, showAlert } from '../ui.js';
import {
  downloadFile,
  formatBytes,
  readFileAsArrayBuffer,
  getPDFDocument,
} from '../utils/helpers.js';
import { createIcons, icons } from 'lucide';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import type { AdjustColorsSettings } from '../types/adjust-colors-type.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

let files: File[] = [];
let cachedBaselineData: ImageData | null = null;
let cachedBaselineWidth = 0;
let cachedBaselineHeight = 0;
let pdfjsDoc: pdfjsLib.PDFDocumentProxy | null = null;

function getSettings(): AdjustColorsSettings {
  return {
    brightness: parseInt(
      (document.getElementById('setting-brightness') as HTMLInputElement)
        ?.value ?? '0'
    ),
    contrast: parseInt(
      (document.getElementById('setting-contrast') as HTMLInputElement)
        ?.value ?? '0'
    ),
    saturation: parseInt(
      (document.getElementById('setting-saturation') as HTMLInputElement)
        ?.value ?? '0'
    ),
    hueShift: parseInt(
      (document.getElementById('setting-hue-shift') as HTMLInputElement)
        ?.value ?? '0'
    ),
    temperature: parseInt(
      (document.getElementById('setting-temperature') as HTMLInputElement)
        ?.value ?? '0'
    ),
    tint: parseInt(
      (document.getElementById('setting-tint') as HTMLInputElement)?.value ??
        '0'
    ),
    gamma: parseFloat(
      (document.getElementById('setting-gamma') as HTMLInputElement)?.value ??
        '1.0'
    ),
    sepia: parseInt(
      (document.getElementById('setting-sepia') as HTMLInputElement)?.value ??
        '0'
    ),
  };
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }

  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }

  const hue2rgb = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

function applyEffects(
  sourceData: ImageData,
  canvas: HTMLCanvasElement,
  settings: AdjustColorsSettings
): void {
  const ctx = canvas.getContext('2d')!;
  const w = sourceData.width;
  const h = sourceData.height;

  canvas.width = w;
  canvas.height = h;

  const imageData = new ImageData(new Uint8ClampedArray(sourceData.data), w, h);
  const data = imageData.data;

  const contrastFactor =
    settings.contrast !== 0
      ? (259 * (settings.contrast + 255)) / (255 * (259 - settings.contrast))
      : 1;

  const gammaCorrection = settings.gamma !== 1.0 ? 1 / settings.gamma : 1;
  const sepiaAmount = settings.sepia / 100;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // Brightness
    if (settings.brightness !== 0) {
      const adj = settings.brightness * 2.55;
      r += adj;
      g += adj;
      b += adj;
    }

    // Contrast
    if (settings.contrast !== 0) {
      r = contrastFactor * (r - 128) + 128;
      g = contrastFactor * (g - 128) + 128;
      b = contrastFactor * (b - 128) + 128;
    }

    // Saturation and Hue Shift (via HSL)
    if (settings.saturation !== 0 || settings.hueShift !== 0) {
      const [hue, sat, lig] = rgbToHsl(
        Math.max(0, Math.min(255, r)),
        Math.max(0, Math.min(255, g)),
        Math.max(0, Math.min(255, b))
      );

      let newHue = hue;
      if (settings.hueShift !== 0) {
        newHue = (hue + settings.hueShift / 360) % 1;
        if (newHue < 0) newHue += 1;
      }

      let newSat = sat;
      if (settings.saturation !== 0) {
        const satAdj = settings.saturation / 100;
        newSat = satAdj > 0 ? sat + (1 - sat) * satAdj : sat * (1 + satAdj);
        newSat = Math.max(0, Math.min(1, newSat));
      }

      [r, g, b] = hslToRgb(newHue, newSat, lig);
    }

    // Temperature (warm/cool shift)
    if (settings.temperature !== 0) {
      const t = settings.temperature / 50;
      r += 30 * t;
      b -= 30 * t;
    }

    // Tint (green-magenta axis)
    if (settings.tint !== 0) {
      const t = settings.tint / 50;
      g += 30 * t;
    }

    // Gamma
    if (settings.gamma !== 1.0) {
      r = Math.pow(Math.max(0, Math.min(255, r)) / 255, gammaCorrection) * 255;
      g = Math.pow(Math.max(0, Math.min(255, g)) / 255, gammaCorrection) * 255;
      b = Math.pow(Math.max(0, Math.min(255, b)) / 255, gammaCorrection) * 255;
    }

    // Sepia
    if (settings.sepia > 0) {
      const sr = 0.393 * r + 0.769 * g + 0.189 * b;
      const sg = 0.349 * r + 0.686 * g + 0.168 * b;
      const sb = 0.272 * r + 0.534 * g + 0.131 * b;
      r = r + (sr - r) * sepiaAmount;
      g = g + (sg - g) * sepiaAmount;
      b = b + (sb - b) * sepiaAmount;
    }

    data[i] = Math.max(0, Math.min(255, r));
    data[i + 1] = Math.max(0, Math.min(255, g));
    data[i + 2] = Math.max(0, Math.min(255, b));
  }

  ctx.putImageData(imageData, 0, 0);
}

function updatePreview(): void {
  if (!cachedBaselineData) return;

  const previewCanvas = document.getElementById(
    'preview-canvas'
  ) as HTMLCanvasElement;
  if (!previewCanvas) return;

  const settings = getSettings();
  const baselineCopy = new ImageData(
    new Uint8ClampedArray(cachedBaselineData.data),
    cachedBaselineWidth,
    cachedBaselineHeight
  );

  applyEffects(baselineCopy, previewCanvas, settings);
}

async function renderPreview(): Promise<void> {
  if (!pdfjsDoc) return;

  const page = await pdfjsDoc.getPage(1);
  const viewport = page.getViewport({ scale: 1.0 });
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({ canvasContext: ctx, viewport, canvas }).promise;

  cachedBaselineData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  cachedBaselineWidth = canvas.width;
  cachedBaselineHeight = canvas.height;

  updatePreview();
}

const updateUI = () => {
  const fileDisplayArea = document.getElementById('file-display-area');
  const optionsPanel = document.getElementById('options-panel');

  if (!fileDisplayArea || !optionsPanel) return;

  fileDisplayArea.innerHTML = '';

  if (files.length > 0) {
    optionsPanel.classList.remove('hidden');

    files.forEach((file) => {
      const fileDiv = document.createElement('div');
      fileDiv.className =
        'flex items-center justify-between bg-gray-700 p-3 rounded-lg text-sm';

      const infoContainer = document.createElement('div');
      infoContainer.className = 'flex flex-col overflow-hidden';

      const nameSpan = document.createElement('div');
      nameSpan.className = 'truncate font-medium text-gray-200 text-sm mb-1';
      nameSpan.textContent = file.name;

      const metaSpan = document.createElement('div');
      metaSpan.className = 'text-xs text-gray-400';
      metaSpan.textContent = `${formatBytes(file.size)} • Loading pages...`;

      infoContainer.append(nameSpan, metaSpan);

      const removeBtn = document.createElement('button');
      removeBtn.className =
        'ml-4 text-red-400 hover:text-red-300 flex-shrink-0';
      removeBtn.innerHTML = '<i data-lucide="trash-2" class="w-4 h-4"></i>';
      removeBtn.onclick = () => {
        files = [];
        pdfjsDoc = null;
        cachedBaselineData = null;
        updateUI();
      };

      fileDiv.append(infoContainer, removeBtn);
      fileDisplayArea.appendChild(fileDiv);

      readFileAsArrayBuffer(file)
        .then((buffer: ArrayBuffer) => {
          return getPDFDocument(buffer).promise;
        })
        .then((pdf: pdfjsLib.PDFDocumentProxy) => {
          metaSpan.textContent = `${formatBytes(file.size)} • ${pdf.numPages} page${pdf.numPages !== 1 ? 's' : ''}`;
        })
        .catch(() => {
          metaSpan.textContent = formatBytes(file.size);
        });
    });

    createIcons({ icons });
  } else {
    optionsPanel.classList.add('hidden');
  }
};

const resetState = () => {
  files = [];
  pdfjsDoc = null;
  cachedBaselineData = null;
  const fileInput = document.getElementById('file-input') as HTMLInputElement;
  if (fileInput) fileInput.value = '';
  updateUI();
};

async function processAllPages(): Promise<void> {
  if (files.length === 0) {
    showAlert('No File', 'Please upload a PDF file first.');
    return;
  }

  showLoader('Applying color adjustments...');

  try {
    const settings = getSettings();
    const pdfBytes = (await readFileAsArrayBuffer(files[0])) as ArrayBuffer;
    const doc = await getPDFDocument({ data: pdfBytes }).promise;
    const newPdfDoc = await PDFDocument.create();

    for (let i = 1; i <= doc.numPages; i++) {
      showLoader(`Processing page ${i} of ${doc.numPages}...`);

      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 });
      const renderCanvas = document.createElement('canvas');
      const renderCtx = renderCanvas.getContext('2d')!;
      renderCanvas.width = viewport.width;
      renderCanvas.height = viewport.height;

      await page.render({
        canvasContext: renderCtx,
        viewport,
        canvas: renderCanvas,
      }).promise;

      const baseData = renderCtx.getImageData(
        0,
        0,
        renderCanvas.width,
        renderCanvas.height
      );

      const outputCanvas = document.createElement('canvas');
      applyEffects(baseData, outputCanvas, settings);

      const pngBlob = await new Promise<Blob | null>((resolve) =>
        outputCanvas.toBlob(resolve, 'image/png')
      );

      if (pngBlob) {
        const pngBytes = await pngBlob.arrayBuffer();
        const pngImage = await newPdfDoc.embedPng(pngBytes);
        const origViewport = page.getViewport({ scale: 1.0 });
        const newPage = newPdfDoc.addPage([
          origViewport.width,
          origViewport.height,
        ]);
        newPage.drawImage(pngImage, {
          x: 0,
          y: 0,
          width: origViewport.width,
          height: origViewport.height,
        });
      }
    }

    const resultBytes = await newPdfDoc.save();
    downloadFile(
      new Blob([new Uint8Array(resultBytes)], { type: 'application/pdf' }),
      'color-adjusted.pdf'
    );
    showAlert(
      'Success',
      'Color adjustments applied successfully!',
      'success',
      () => {
        resetState();
      }
    );
  } catch (e) {
    console.error(e);
    showAlert(
      'Error',
      'Failed to apply color adjustments. The file might be corrupted.'
    );
  } finally {
    hideLoader();
  }
}

const sliderDefaults: {
  id: string;
  display: string;
  suffix: string;
  defaultValue: string;
}[] = [
  {
    id: 'setting-brightness',
    display: 'brightness-value',
    suffix: '',
    defaultValue: '0',
  },
  {
    id: 'setting-contrast',
    display: 'contrast-value',
    suffix: '',
    defaultValue: '0',
  },
  {
    id: 'setting-saturation',
    display: 'saturation-value',
    suffix: '',
    defaultValue: '0',
  },
  {
    id: 'setting-hue-shift',
    display: 'hue-shift-value',
    suffix: '°',
    defaultValue: '0',
  },
  {
    id: 'setting-temperature',
    display: 'temperature-value',
    suffix: '',
    defaultValue: '0',
  },
  { id: 'setting-tint', display: 'tint-value', suffix: '', defaultValue: '0' },
  {
    id: 'setting-gamma',
    display: 'gamma-value',
    suffix: '',
    defaultValue: '1.0',
  },
  {
    id: 'setting-sepia',
    display: 'sepia-value',
    suffix: '',
    defaultValue: '0',
  },
];

function resetSettings(): void {
  sliderDefaults.forEach(({ id, display, suffix, defaultValue }) => {
    const slider = document.getElementById(id) as HTMLInputElement;
    const label = document.getElementById(display);
    if (slider) slider.value = defaultValue;
    if (label) label.textContent = defaultValue + suffix;
  });

  updatePreview();
}

function setupSettingsListeners(): void {
  sliderDefaults.forEach(({ id, display, suffix }) => {
    const slider = document.getElementById(id) as HTMLInputElement;
    const label = document.getElementById(display);
    if (slider && label) {
      slider.addEventListener('input', () => {
        label.textContent = slider.value + suffix;
        updatePreview();
      });
    }
  });

  const resetBtn = document.getElementById('reset-settings-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', resetSettings);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const fileInput = document.getElementById('file-input') as HTMLInputElement;
  const dropZone = document.getElementById('drop-zone');
  const processBtn = document.getElementById('process-btn');
  const backBtn = document.getElementById('back-to-tools');

  if (backBtn) {
    backBtn.addEventListener('click', () => {
      window.location.href = import.meta.env.BASE_URL;
    });
  }

  const handleFileSelect = async (newFiles: FileList | null) => {
    if (!newFiles || newFiles.length === 0) return;
    const validFiles = Array.from(newFiles).filter(
      (file) => file.type === 'application/pdf'
    );

    if (validFiles.length === 0) {
      showAlert('Invalid File', 'Please upload a PDF file.');
      return;
    }

    files = [validFiles[0]];
    updateUI();

    showLoader('Loading preview...');
    try {
      const buffer = await readFileAsArrayBuffer(validFiles[0]);
      pdfjsDoc = await getPDFDocument({ data: buffer }).promise;
      await renderPreview();
    } catch (e) {
      console.error(e);
      showAlert('Error', 'Failed to load PDF for preview.');
    } finally {
      hideLoader();
    }
  };

  if (fileInput && dropZone) {
    fileInput.addEventListener('change', (e) => {
      handleFileSelect((e.target as HTMLInputElement).files);
    });

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('bg-gray-700');
    });

    dropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dropZone.classList.remove('bg-gray-700');
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('bg-gray-700');
      handleFileSelect(e.dataTransfer?.files ?? null);
    });

    fileInput.addEventListener('click', () => {
      fileInput.value = '';
    });
  }

  if (processBtn) {
    processBtn.addEventListener('click', processAllPages);
  }

  setupSettingsListeners();
});
