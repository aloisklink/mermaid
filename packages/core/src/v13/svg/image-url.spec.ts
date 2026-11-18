import { describe, expect, it } from 'vitest';
import { inertProblem } from './inert.js';
import { styleScope } from './style.js';
import { checkImageUrl } from './url.js';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

describe('checkImageUrl (R-SEC-2)', () => {
  it('accepts raster data URLs, http(s) and relative sources', () => {
    for (const url of [PNG, 'data:image/webp;base64,UklG', 'https://x.test/a.png', 'img/a.png'])
      expect(checkImageUrl(url, {})).toBe(url);
  });

  it('refuses svg data URLs, mail and script schemes, and http under strict', () => {
    const warnings: string[] = [];
    const warn = (w: { code: string }) => void warnings.push(w.code);
    for (const url of [
      'data:image/svg+xml;base64,PHN2Zz4=',
      'data:text/html,<b>x</b>',
      'mailto:a@b.c',
      'javascript:alert(1)',
    ])
      expect(checkImageUrl(url, { warn })).toBeUndefined();
    expect(checkImageUrl('https://x.test/a.png', { securityLevel: 'strict' })).toBeUndefined();
    expect(checkImageUrl(PNG, { securityLevel: 'strict' })).toBe(PNG);
    expect(warnings).toEqual(['URL_REFUSED', 'URL_REFUSED', 'URL_REFUSED', 'URL_REFUSED']);
  });

  it('agrees with the inert check, which only takes raster data URLs on <image>', () => {
    const svg = (tag: string, href: string) =>
      `<svg xmlns="http://www.w3.org/2000/svg"><${tag} href="${href}"/></svg>`;
    expect(inertProblem(svg('image', PNG))).toBeUndefined();
    expect(inertProblem(svg('a', PNG))).toBeDefined();
    expect(inertProblem(svg('image', 'mailto:a@b.c'))).toBeDefined();
  });
});

describe('styleScope', () => {
  it('keeps an id that is already a scope and hashes any other', () => {
    expect(styleScope('mermaid-1')).toBe('mermaid-1');
    expect(styleScope('mermaid-svg-:r1:')).toMatch(/^p-[0-9a-z]+$/);
    expect(styleScope('a b')).not.toBe(styleScope('a_b'));
  });
});
