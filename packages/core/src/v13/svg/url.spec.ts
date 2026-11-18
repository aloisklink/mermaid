import { describe, expect, it } from 'vitest';
import { checkLinkTarget, checkUrl, resolveSecurityLevel, type SvgWarning } from './index.js';

const collect = () => {
  const warnings: SvgWarning[] = [];
  return { warnings, warn: (w: SvgWarning) => warnings.push(w) };
};

const ALLOWED_DEFAULT = [
  'https://example.com',
  'http://EXAMPLE.com/Path?q=1#frag',
  'HTTPS://example.com',
  'mailto:someone@example.com',
  'click.html',
  './relative/path',
  '../up',
  '/absolute/path',
  '#heading',
  '?query=1',
  'note name with spaces',
  'Note%20name',
  'https://example.com/?q=a%26b',
];

const REFUSED_ALWAYS = [
  '',
  '   ',
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  '  javascript:alert(1)',
  'java\nscript:alert(1)',
  'java\tscript:alert(1)',
  '\u0001javascript:alert(1)',
  'jav&#x09;ascript:alert(1)',
  '&#106;avascript:alert(1)',
  '&#106avascript:alert(1)',
  'javascript&colon;alert(1)',
  'javascript#colon;alert(1)',
  'javascript#58;alert(1)',
  '%6A%61%76%61%73%63%72%69%70%74:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  'DATA:image/svg+xml;base64,PHN2Zz4=',
  'vbscript:msgbox(1)',
  'file:///etc/passwd',
  'fi%6ce:///etc/passwd',
  'ftp://example.com/file',
  'smb://evil.example/share',
  'obsidian://open?vault=x',
  'about:blank',
  'tel:+123456',
  'C:\\Users\\file.txt',
  '//evil.example/share',
  '%2F%2Fevil.example/share',
  '\\\\server\\share',
  '/\\evil.example',
  '/\t/evil.example',
  'java\ufffescript:alert(1)',
  'java\u200bscript:alert(1)',
  "javasjavascript:cript:alert('goose')",
  '<script></script>JavaScript:xssAttack`1`',
];

describe('checkUrl at the default security level', () => {
  for (const url of ALLOWED_DEFAULT) {
    it(`keeps ${JSON.stringify(url)}`, () => {
      expect(checkUrl(url, {})).toBe(url);
    });
  }
  for (const url of REFUSED_ALWAYS) {
    it(`refuses ${JSON.stringify(url)} with a warning`, () => {
      const { warnings, warn } = collect();
      expect(checkUrl(url, { warn })).toBeUndefined();
      expect(warnings.map((w) => w.code)).toEqual(['URL_REFUSED']);
    });
  }

  it('removes control characters and decodes entity codes in what it keeps', () => {
    expect(checkUrl('  https://example.com/a\u0000b  ', {})).toBe('https://example.com/ab');
    expect(checkUrl('https&#58;//example.com', {})).toBe('https://example.com');
    expect(checkUrl('/a?x=1&amp;y=2', {})).toBe('/a?x=1&y=2');
  });

  it('honours an integrator scheme list', () => {
    expect(checkUrl('tel:+1', { linkSchemes: ['tel'] })).toBe('tel:+1');
    expect(checkUrl('https://example.com', { linkSchemes: ['tel'] })).toBeUndefined();
    expect(checkUrl('javascript:alert(1)', { linkSchemes: ['tel'] })).toBeUndefined();
  });
});

describe('checkUrl at the strict security level', () => {
  it('keeps relative links only', () => {
    for (const url of ['click.html', './a', '/b', '#c', '?d=1']) {
      expect(checkUrl(url, { securityLevel: 'strict' })).toBe(url);
    }
    for (const url of [
      'https://example.com',
      'mailto:a@example.com',
      'http://x',
      ...REFUSED_ALWAYS,
    ]) {
      expect(checkUrl(url, { securityLevel: 'strict' }), url).toBeUndefined();
    }
  });
});

describe('resolveSecurityLevel', () => {
  it('keeps default and strict', () => {
    const { warnings, warn } = collect();
    expect(resolveSecurityLevel(undefined, warn)).toBe('default');
    expect(resolveSecurityLevel('default', warn)).toBe('default');
    expect(resolveSecurityLevel('strict', warn)).toBe('strict');
    expect(warnings).toEqual([]);
  });

  it('treats the removed v12 levels as default, with a warning', () => {
    for (const level of ['loose', 'antiscript', 'sandbox', 'bogus', 42]) {
      const { warnings, warn } = collect();
      expect(resolveSecurityLevel(level, warn)).toBe('default');
      expect(warnings.map((w) => w.code)).toEqual(['SECURITY_LEVEL']);
    }
  });
});

describe('checkLinkTarget', () => {
  it('keeps the v12 targets', () => {
    for (const t of ['_self', '_blank', '_parent', '_top']) expect(checkLinkTarget(t)).toBe(t);
    expect(checkLinkTarget(undefined)).toBeUndefined();
  });

  it('drops any other target with a warning', () => {
    for (const t of ['frame1', '_new', '" onclick="x', '_BLANK']) {
      const { warnings, warn } = collect();
      expect(checkLinkTarget(t, warn)).toBeUndefined();
      expect(warnings.map((w) => w.code)).toEqual(['LINK_TARGET_DROPPED']);
    }
  });
});
