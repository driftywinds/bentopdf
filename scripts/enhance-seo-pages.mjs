import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'url';
import { serializeJsonLd } from './json-ld.mjs';
import { DEFAULT_SITE_URL, rebaseDefaultOrigin } from './site-origin.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIST_DIR = path.resolve(__dirname, '../dist');
const SITE_URL = (process.env.SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, '');
const BLOG_DIST_DIR = path.join(DIST_DIR, 'blog');

const FALLBACK_SOCIAL_IMAGE = '/images/og-tools.png';

function listTopLevelHtml() {
  return fs
    .readdirSync(DIST_DIR)
    .filter((f) => f.endsWith('.html'))
    .map((f) => path.join(DIST_DIR, f));
}

// generate-blog.mjs writes the blog index and posts with SITE_URL, but
// hand-written blog pages (blog/author-alam.html) carry the official origin
// literally, and generate-i18n-pages.mjs only rewrites top-level pages. Rebase
// them here so a custom-SITE_URL build passes seo-audit's canonical check.
function rebaseBlogPages() {
  if (!fs.existsSync(BLOG_DIST_DIR)) return 0;
  let rebased = 0;
  for (const f of fs.readdirSync(BLOG_DIST_DIR)) {
    if (!f.endsWith('.html')) continue;
    const file = path.join(BLOG_DIST_DIR, f);
    const html = fs.readFileSync(file, 'utf-8');
    const out = rebaseDefaultOrigin(html, SITE_URL);
    if (out !== html) {
      fs.writeFileSync(file, out);
      rebased++;
    }
  }
  return rebased;
}

function imageExists(url) {
  if (!url) return true;
  let pathname;
  try {
    pathname = url.startsWith('http') ? new URL(url).pathname : url;
  } catch {
    return true;
  }
  if (!pathname.startsWith('/images/')) return true;
  return fs.existsSync(path.join(DIST_DIR, pathname.replace(/^\//, '')));
}

function fixSocialImages(document) {
  const selectors = ['meta[property="og:image"]', 'meta[name="twitter:image"]'];
  for (const selector of selectors) {
    for (const meta of document.querySelectorAll(selector)) {
      const value = meta.getAttribute('content');
      if (!imageExists(value)) {
        meta.setAttribute('content', `${SITE_URL}${FALLBACK_SOCIAL_IMAGE}`);
      }
    }
  }
}

function fixApplicationCategory(document) {
  for (const script of document.querySelectorAll(
    'script[type="application/ld+json"]'
  )) {
    let data;
    try {
      data = JSON.parse(script.textContent || '');
    } catch {
      continue;
    }
    if (
      data &&
      (data['@type'] === 'SoftwareApplication' ||
        data['@type'] === 'WebApplication') &&
      data.applicationCategory !== 'UtilitiesApplication'
    ) {
      data.applicationCategory = 'UtilitiesApplication';
      script.textContent = serializeJsonLd(data);
    }
  }
}

function hasLdType(document, typeName) {
  return [
    ...document.querySelectorAll('script[type="application/ld+json"]'),
  ].some((s) => (s.textContent || '').includes(`"${typeName}"`));
}

function injectFaqSchema(document) {
  if (hasLdType(document, 'FAQPage')) return false;
  const items = [];
  for (const details of document.querySelectorAll('details.faq-d')) {
    const summary = details.querySelector('summary');
    const answer = details.querySelector('p');
    if (!summary || !answer) continue;
    const question = summary.textContent.replace(/\s+/g, ' ').trim();
    const answerText = answer.textContent.replace(/\s+/g, ' ').trim();
    if (!question || !answerText) continue;
    items.push({
      '@type': 'Question',
      name: question,
      acceptedAnswer: { '@type': 'Answer', text: answerText },
    });
  }
  if (items.length === 0) return false;
  const script = document.createElement('script');
  script.setAttribute('type', 'application/ld+json');
  script.textContent = serializeJsonLd({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items,
  });
  document.body.appendChild(script);
  return true;
}

function injectWebsiteSchema(document) {
  if (hasLdType(document, 'WebSite')) return;
  const script = document.createElement('script');
  script.setAttribute('type', 'application/ld+json');
  script.textContent = serializeJsonLd({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'BentoPDF',
    alternateName: ['Bento PDF', 'BentoPDF.com'],
    url: `${SITE_URL}/`,
  });
  document.body.appendChild(script);
}

function rewriteInternalLinks(document, knownSlugs) {
  for (const link of document.querySelectorAll('a[href]')) {
    const href = link.getAttribute('href');
    if (!href || /^(https?:|\/\/|#|mailto:|tel:|data:)/.test(href)) continue;
    const match = href.match(
      /^(?:\.\/|\/)?([a-z0-9][a-z0-9-]{0,64})\.html(#[^#]{0,128})?$/
    );
    if (!match) continue;
    if (!knownSlugs.has(match[1])) continue;
    const target = match[1] === 'index' ? '/' : `/${match[1]}`;
    link.setAttribute('href', `${target}${match[2] || ''}`);
  }
}

function enhance() {
  if (!fs.existsSync(DIST_DIR)) {
    console.error('enhance-seo-pages: dist not found, run vite build first');
    process.exit(1);
  }
  const files = listTopLevelHtml();
  const knownSlugs = new Set(files.map((f) => path.basename(f, '.html')));

  let faqSchemaCount = 0;
  for (const file of files) {
    const slug = path.basename(file, '.html');
    const dom = new JSDOM(fs.readFileSync(file, 'utf-8'));
    const document = dom.window.document;

    fixSocialImages(document);
    fixApplicationCategory(document);
    rewriteInternalLinks(document, knownSlugs);

    if (slug === 'index') {
      injectWebsiteSchema(document);
    }

    if (slug !== '404') {
      if (injectFaqSchema(document)) faqSchemaCount++;
    }

    fs.writeFileSync(file, dom.serialize());
    dom.window.close();
  }
  const rebasedBlogPages = rebaseBlogPages();
  console.log(
    `SEO enhance: ${files.length} pages processed, ${faqSchemaCount} FAQPage schemas added, ${rebasedBlogPages} blog pages rebased to ${SITE_URL}.`
  );
}

enhance();
