import packageJson from '../package.json';

export const APP_VERSION = packageJson.version;

export function injectVersion() {
  const versionElements = document.querySelectorAll('#app-version, #app-version-simple');
  versionElements.forEach((element) => {
    element.textContent = APP_VERSION;
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectVersion);
  } else {
    injectVersion();
  }
}
