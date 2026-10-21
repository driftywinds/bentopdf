/**
 * The public origin the build writes into canonical / og:url / JSON-LD URLs.
 * Self-hosters set SITE_URL at build time; the default is the official site.
 */
export const DEFAULT_SITE_URL = 'https://www.bentopdf.com';

const DEFAULT_ORIGIN_RE = /https:\/\/www\.bentopdf\.com(?![\w.-])/g;

/**
 * Rewrites absolute URLs on the default origin to `siteUrl` (no trailing
 * slash). Used for hand-written pages that carry the official origin
 * literally, so a build with a custom SITE_URL emits canonicals on its own
 * host. Other hosts, including look-alikes such as
 * `https://www.bentopdf.com.example`, are left untouched.
 */
export function rebaseDefaultOrigin(html, siteUrl) {
  if (siteUrl === DEFAULT_SITE_URL) return html;
  return html.replace(DEFAULT_ORIGIN_RE, siteUrl);
}
