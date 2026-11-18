import { describe, expect, it } from 'vitest';
import { esc, RE_INVALID_XML } from './escape.js';

describe('esc', () => {
  it('escapes markup characters', () => {
    expect(esc('a & <b> "c"')).toBe('a &amp; &lt;b&gt; &quot;c&quot;');
  });

  it('drops exactly the characters RE_INVALID_XML rejects', () => {
    for (let c = 0; c <= 0xffff; c++) {
      const ch = String.fromCharCode(c);
      if ('&<>"'.includes(ch)) continue;
      expect(esc(ch) === '', `U+${c.toString(16)}`).toBe(RE_INVALID_XML.test(ch));
    }
  });

  it('keeps surrogate pairs and drops lone halves', () => {
    expect(esc('😀')).toBe('😀');
    expect(esc('a\ud83db\ude00c')).toBe('abc');
  });
});
