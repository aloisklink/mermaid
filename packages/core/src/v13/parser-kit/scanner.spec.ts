import { describe, expect, it } from 'vitest';
import { execAt, isDigit, lineEnd, matchAt, newlineAt, scanWhile } from './index.js';

describe('Scanner', () => {
  const ARROW = /-{2,}>/y;

  it('matches a sticky regex exactly at an offset and returns the end offset', () => {
    expect(matchAt(ARROW, 'A --> B', 2)).toBe(5);
    expect(matchAt(ARROW, 'A --> B', 1)).toBe(-1); // no search forward
    expect(matchAt(ARROW, 'A --> B', 99)).toBe(-1);
  });

  it('returns the match groups with execAt and does not depend on earlier calls', () => {
    const RE = /(\w+)=(\w+)/y;
    expect(execAt(RE, 'a=b c=d', 4)?.slice(1)).toEqual(['c', 'd']);
    expect(execAt(RE, 'a=b c=d', 0)?.slice(1)).toEqual(['a', 'b']);
    expect(execAt(RE, 'a=b c=d', 3)).toBeNull();
  });

  it('refuses regexes without the sticky flag, which would search ahead', () => {
    expect(() => matchAt(/-->/, 'x-->', 0)).toThrow(TypeError);
    expect(() => execAt(/-->/g, 'x-->', 0)).toThrow(TypeError);
  });

  it('scans while a predicate holds and stops at the end of input', () => {
    expect(scanWhile('123abc', 0, isDigit)).toBe(3);
    expect(scanWhile('123', 1, isDigit)).toBe(3);
    expect(scanWhile('abc', 0, isDigit)).toBe(0);
  });

  it('finds the end of the line without consuming the line break', () => {
    expect(lineEnd('ab\ncd', 0)).toBe(2);
    expect(lineEnd('ab\r\ncd', 1)).toBe(2);
    expect(lineEnd('ab\rcd', 0)).toBe(2);
    expect(lineEnd('abcd', 1)).toBe(4);
  });

  it('measures the line break at an offset: CRLF is one break of length 2', () => {
    expect(newlineAt('a\r\nb', 1)).toBe(2);
    expect(newlineAt('a\nb', 1)).toBe(1);
    expect(newlineAt('a\rb', 1)).toBe(1);
    expect(newlineAt('ab', 1)).toBe(0);
    expect(newlineAt('a', 1)).toBe(0);
  });
});
