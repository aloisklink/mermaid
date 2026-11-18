import { describe, expect, it } from 'vitest';
import { decodeEntities } from './entities.js';

describe('decodeEntities', () => {
  it('decodes the ASCII punctuation names authors use to escape syntax (#396)', () => {
    const names =
      'colon semi vert verbar lpar rpar lsqb rsqb lcub rcub num excl quest commat equals plus comma period sol bsol grave lowbar percnt dollar ast';
    const source = names
      .split(' ')
      .map((name) => `&${name};`)
      .join('');
    expect(decodeEntities(source)).toBe(':;||()[]{}#!?@=+,./\\`_%$*');
  });

  it('decodes named, decimal and hex references between other text', () => {
    expect(decodeEntities('a &lt; b &amp;&amp; c &#35;1 &#x41;&hearts;')).toBe('a < b && c #1 A♥');
  });

  it('leaves an unknown name and a bare ampersand as written', () => {
    expect(decodeEntities('R&D &bogus; &; &colon')).toBe('R&D &bogus; &; &colon');
  });

  it('decodes once: a decoded ampersand does not start a new reference', () => {
    expect(decodeEntities('&amp;lt;')).toBe('&lt;');
  });

  it('returns text without an ampersand unchanged', () => {
    expect(decodeEntities('plain #colon; text')).toBe('plain #colon; text');
  });
});
