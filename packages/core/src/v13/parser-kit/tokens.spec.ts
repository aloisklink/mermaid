import { describe, expect, it } from 'vitest';
import { FIRST_DIAGRAM_KIND, Kind, tokenText, TokenWriter } from './index.js';

describe('TokenStream', () => {
  it('stores tokens as parallel typed arrays and finishes with an EOF token', () => {
    const w = new TokenWriter();
    w.push(FIRST_DIAGRAM_KIND, 0, 1);
    w.push(Kind.Space, 1, 2);
    w.push(FIRST_DIAGRAM_KIND + 1, 2, 5);
    const s = w.finish('A -->');

    expect(s.kind).toBeInstanceOf(Uint16Array);
    expect(s.start).toBeInstanceOf(Uint32Array);
    expect(s.end).toBeInstanceOf(Uint32Array);
    expect(s.length).toBe(4);
    expect([...s.kind]).toEqual([16, Kind.Space, 17, Kind.EOF]);
    expect([...s.start]).toEqual([0, 1, 2, 5]);
    expect([...s.end]).toEqual([1, 2, 5, 5]);
    expect(Array.from({ length: s.length }, (_, i) => tokenText(s, i))).toEqual([
      'A',
      ' ',
      '-->',
      '',
    ]);
  });

  it('always ends with exactly one EOF token, even for empty input', () => {
    const s = new TokenWriter().finish('');
    expect(s.length).toBe(1);
    expect(s.kind[0]).toBe(Kind.EOF);
  });

  it('reserves kinds below FIRST_DIAGRAM_KIND for the shared kinds', () => {
    for (const k of Object.values(Kind)) expect(k).toBeLessThan(FIRST_DIAGRAM_KIND);
    expect(new Set(Object.values(Kind)).size).toBe(Object.keys(Kind).length);
  });
});
