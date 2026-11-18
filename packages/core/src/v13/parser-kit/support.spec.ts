import { describe, expect, it } from 'vitest';
import { ID_CONTROL, ID_RESERVED, ampEntities, decodePlaceholders, idEscaper } from './support.js';
import { Stop, STOP } from './stop.js';

describe('decodePlaceholders (D561)', () => {
  it('undoes the placeholders of v12 as its renderer did', () => {
    expect(decodePlaceholders('a ﬂ°amp¶ß b ﬂ°°35¶ß c ﬂ°colon¶ß')).toBe('a &amp; b &#35; c &colon;');
    expect(decodePlaceholders('no placeholder; &amp; #35;')).toBe('no placeholder; &amp; #35;');
  });

  it('writes a name core cannot decode back as the author wrote it', () => {
    expect(decodePlaceholders('x ﬂ°bogus¶ß y ﬂ°f9f¶ß')).toBe('x #bogus; y #f9f;');
  });

  it('decodes the halves of a placeholder that was split, as v12 did', () => {
    expect(decodePlaceholders('ﬂ°')).toBe('&');
    expect(decodePlaceholders('¶ß')).toBe(';');
  });
});

describe('ampEntities (D561)', () => {
  it('writes each entity code as the reference v12 drew', () => {
    expect(ampEntities('a #amp; b #35; c #colon;')).toBe('a &amp; b &#35; c &colon;');
    expect(ampEntities('#9829;#lt;')).toBe('&#9829;&lt;');
  });

  it('keeps a name core cannot decode, and text that is no code, as written', () => {
    expect(ampEntities('x #bogus; y #f9f; # z; #a#gt; &amp;')).toBe(
      'x #bogus; y #f9f; # z; #a&gt; &amp;'
    );
    expect(ampEntities('plain')).toBe('plain');
  });
});

describe('STOP', () => {
  it('is one Stop instance', () => {
    expect(STOP).toBeInstanceOf(Stop);
    expect(STOP).toBeInstanceOf(Error);
  });
});

describe('idEscaper', () => {
  it('escapes the id grammar characters by default', () => {
    expect(idEscaper()('a%b>c@d#e f')).toBe('a%25b%3Ec%40d%23e f');
    expect(idEscaper(ID_RESERVED)('plain')).toBe('plain');
  });

  it('escapes a passed set, with four digits from U+0080 on', () => {
    const esc = idEscaper(ID_RESERVED + ID_CONTROL);
    expect(esc('a\u0001b')).toBe('a%01b');
    expect(esc('￾')).toBe('%FFFE');
    expect(esc('\ud800')).toBe('%D800');
  });
});
