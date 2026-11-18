import { describe, expect, it } from 'vitest';
import { configNumber, rawConfigNumber, useMaxWidth } from './readers.js';

describe('rawConfigNumber', () => {
  it('reads numbers and numeric strings, a blank one only when asked', () => {
    expect(rawConfigNumber(3)).toBe(3);
    expect(rawConfigNumber('2.5')).toBe(2.5);
    expect(rawConfigNumber('')).toBeNaN();
    expect(rawConfigNumber(' ', true)).toBe(0);
    expect(rawConfigNumber(true)).toBeNaN();
  });
});

describe('configNumber', () => {
  it('takes a finite number at least min, capped at max', () => {
    expect(configNumber('7', 0, 5)).toBe(5);
    expect(configNumber(-1, 0)).toBeUndefined();
    expect(configNumber('x')).toBeUndefined();
    expect(configNumber(Infinity)).toBeUndefined();
    expect(configNumber('', 0, Infinity, true)).toBe(0);
  });
});

describe('useMaxWidth', () => {
  it('reads each policy', () => {
    expect(useMaxWidth(0)).toBe(true);
    expect(useMaxWidth(false)).toBe(false);
    expect(useMaxWidth(0, 'truthy')).toBe(false);
    expect(useMaxWidth(undefined, 'truthy')).toBe(true);
    const bad: unknown[] = [];
    expect(useMaxWidth('no', 'boolean', false, (v) => bad.push(v))).toBe(false);
    expect(useMaxWidth(undefined, 'boolean', true, (v) => bad.push(v))).toBe(true);
    expect(bad).toEqual(['no']);
  });
});
