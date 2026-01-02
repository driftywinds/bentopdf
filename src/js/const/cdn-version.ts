export const PACKAGE_VERSIONS = {
    libreoffice: '2.3.1', 
    ghostscript: '0.1.0', 
    pymupdf: '0.1.9', 
} as const;

export const CDN_URLS = {
    libreoffice: `https://cdn.jsdelivr.net/npm/@bentopdf/libreoffice-wasm@${PACKAGE_VERSIONS.libreoffice}/assets/`,
    ghostscript: `https://cdn.jsdelivr.net/npm/@bentopdf/gs-wasm@${PACKAGE_VERSIONS.ghostscript}/assets/`,
    pymupdf: `https://cdn.jsdelivr.net/npm/@bentopdf/pymupdf-wasm@${PACKAGE_VERSIONS.pymupdf}/assets/`,
} as const;