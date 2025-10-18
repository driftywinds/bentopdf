const STANDARD_SIZES = {
  A4: { width: 595.28, height: 841.89 },
  Letter: { width: 612, height: 792 },
  Legal: { width: 612, height: 1008 },
  Tabloid: { width: 792, height: 1224 },
  A3: { width: 841.89, height: 1190.55 },
  A5: { width: 419.53, height: 595.28 },
};

export function getStandardPageName(width: any, height: any) {
  const tolerance = 1; // Allow for minor floating point variations
  for (const [name, size] of Object.entries(STANDARD_SIZES)) {
    if (
      (Math.abs(width - size.width) < tolerance &&
        Math.abs(height - size.height) < tolerance) ||
      (Math.abs(width - size.height) < tolerance &&
        Math.abs(height - size.width) < tolerance)
    ) {
      return name;
    }
  }
  return 'Custom';
}

export function convertPoints(points: any, unit: any) {
  let result = 0;
  switch (unit) {
    case 'in':
      result = points / 72;
      break;
    case 'mm':
      result = (points / 72) * 25.4;
      break;
    case 'px':
      result = points * (96 / 72); // Assuming 96 DPI
      break;
    default: // 'pt'
      result = points;
      break;
  }
  return result.toFixed(2);
}

export const hexToRgb = (hex: any) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16) / 255,
        g: parseInt(result[2], 16) / 255,
        b: parseInt(result[3], 16) / 255,
      }
    : { r: 0, g: 0, b: 0 }; // Default to black
};

export const formatBytes = (bytes: any, decimals = 1) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

export const downloadFile = (blob: any, filename: any) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const readFileAsArrayBuffer = (file: any) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
};

export function parsePageRanges(rangeString: any, totalPages: any) {
  if (!rangeString || rangeString.trim() === '') {
    return Array.from({ length: totalPages }, (_, i) => i);
  }

  const indices = new Set();
  const parts = rangeString.split(',');

  for (const part of parts) {
    const trimmedPart = part.trim();
    if (!trimmedPart) continue;

    if (trimmedPart.includes('-')) {
      const [start, end] = trimmedPart.split('-').map(Number);
      if (
        isNaN(start) ||
        isNaN(end) ||
        start < 1 ||
        end > totalPages ||
        start > end
      ) {
        console.warn(`Invalid range skipped: ${trimmedPart}`);
        continue;
      }

      for (let i = start; i <= end; i++) {
        indices.add(i - 1);
      }
    } else {
      const pageNum = Number(trimmedPart);

      if (isNaN(pageNum) || pageNum < 1 || pageNum > totalPages) {
        console.warn(`Invalid page number skipped: ${trimmedPart}`);
        continue;
      }
      indices.add(pageNum - 1);
    }
  }

  // @ts-expect-error TS(2362) FIXME: The left-hand side of an arithmetic operation must... Remove this comment to see the full error message
  return Array.from(indices).sort((a, b) => a - b);
}
