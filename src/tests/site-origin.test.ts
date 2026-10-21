import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SITE_URL,
  rebaseDefaultOrigin,
} from '../../scripts/site-origin.mjs';

const PAGE = `<link rel="canonical" href="https://www.bentopdf.com/blog/author-alam" />
<meta property="og:image" content="https://www.bentopdf.com/images/author-alam.jpg" />
<script type="application/ld+json">{"url":"https://www.bentopdf.com","sameAs":["https://github.com/alam00000"]}</script>`;

describe('rebaseDefaultOrigin', () => {
  it('rewrites every default-origin URL to the custom site URL', () => {
    const out = rebaseDefaultOrigin(PAGE, 'https://pdf.example.org');
    expect(out).not.toContain('www.bentopdf.com');
    expect(out).toContain('href="https://pdf.example.org/blog/author-alam"');
    expect(out).toContain(
      'content="https://pdf.example.org/images/author-alam.jpg"'
    );
    expect(out).toContain('"url":"https://pdf.example.org"');
    expect(out).toContain('https://github.com/alam00000');
  });

  it('keeps a subpath site URL intact', () => {
    expect(
      rebaseDefaultOrigin(
        'href="https://www.bentopdf.com/blog/"',
        'https://example.org/pdf'
      )
    ).toBe('href="https://example.org/pdf/blog/"');
  });

  it('leaves look-alike hosts alone', () => {
    const html =
      'href="https://www.bentopdf.com.example/x" href="https://www.bentopdf.community/"';
    expect(rebaseDefaultOrigin(html, 'https://pdf.example.org')).toBe(html);
  });

  it('leaves other ports and userinfo URLs alone', () => {
    const html =
      'href="https://www.bentopdf.com:8443/blog/" href="https://www.bentopdf.com@other.example/"';
    expect(rebaseDefaultOrigin(html, 'https://pdf.example.org')).toBe(html);
  });

  it('inserts the site URL literally', () => {
    expect(
      rebaseDefaultOrigin(
        'href="https://www.bentopdf.com/blog/"',
        'https://example.org/$&'
      )
    ).toBe('href="https://example.org/$&/blog/"');
  });

  it('is a no-op for the default site URL', () => {
    expect(rebaseDefaultOrigin(PAGE, DEFAULT_SITE_URL)).toBe(PAGE);
  });
});
