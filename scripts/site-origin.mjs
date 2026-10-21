/**
 * The public origin the build writes into canonical / og:url / JSON-LD URLs.
 * Self-hosters set SITE_URL at build time; the default is the official site.
 */
export const DEFAULT_SITE_URL = 'https://www.bentopdf.com';

// The exact authority only: not a longer host (`.com.example`), a port
// (`:8443`, a different origin) or userinfo (`@other.example`, another host).
const DEFAULT_ORIGIN_RE = /https:\/\/www\.bentopdf\.com(?![\w.:@-])/g;

/**
 * Rewrites absolute URLs on the default origin to `siteUrl` (no trailing
 * slash). Used for hand-written pages that carry the official origin
 * literally, so a build with a custom SITE_URL emits canonicals on its own
 * host. Other origins are left untouched: look-alike hosts such as
 * `https://www.bentopdf.com.example`, other ports and userinfo URLs.
 */
export function rebaseDefaultOrigin(html, siteUrl) {
  if (siteUrl === DEFAULT_SITE_URL) return html;
  // A callback keeps `siteUrl` literal: a string replacement would expand
  // `$&`, `$1`, … inside it.
  return html.replace(DEFAULT_ORIGIN_RE, () => siteUrl);
}
