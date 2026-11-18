import { describe, expect, it } from 'vitest';
import { DEFAULT_FONT_FAMILY, familyNames, fontSizePx, resolveFontFamily } from './fonts.js';

describe('fontSizePx', () => {
  it('resolves units and keywords as the browser draws them', () => {
    expect(fontSizePx('20px', 16)).toBe(20);
    expect(fontSizePx('12pt', 16)).toBe(16);
    expect(fontSizePx('1.5em', 10)).toBe(15);
    expect(fontSizePx('2rem', 10)).toBe(32);
    expect(fontSizePx('150%', 10)).toBe(15);
    expect(fontSizePx('large', 10)).toBe(18);
    expect(fontSizePx(18, 10)).toBe(18);
  });

  it('gives no size for what has none here', () => {
    expect(fontSizePx('10vw', 16)).toBeUndefined();
    expect(fontSizePx('big', 16)).toBeUndefined();
    expect(fontSizePx(undefined, 16)).toBeUndefined();
  });
});

describe('trailing semicolons', () => {
  it('drops them from a resolved font family, as `/;+$/` did', () => {
    expect(resolveFontFamily('arial;')).toBe('arial');
    expect(resolveFontFamily(' arial ;; ')).toBe('arial');
    expect(resolveFontFamily('a;b ; ;')).toBe('a;b ;');
    expect(resolveFontFamily(';;', ' ; ')).toBe(DEFAULT_FONT_FAMILY);
    expect(resolveFontFamily('arial;', 'verdana;;')).toBe('verdana');
    expect(resolveFontFamily(undefined, '')).toBe(DEFAULT_FONT_FAMILY);
  });

  it('drops them from each family name, before the quotes', () => {
    expect(familyNames('"Trebuchet MS", Verdana;')).toEqual(['trebuchet ms', 'verdana']);
    expect(familyNames('a;;, "b";, ;, c ;')).toEqual(['a', 'b', 'c']);
    expect(familyNames('";"')).toEqual([';']);
    expect(familyNames('";";')).toEqual([';']);
    expect(familyNames('a;b')).toEqual(['a;b']);
  });
});

/** Fastest of `trials` timings of `reps` runs, in ms (Date.now: core has no Node types). */
const fastest = (run: () => unknown, reps: number, trials = 5): number => {
  let best = Infinity;
  for (let t = 0; t < trials; t++) {
    const t0 = Date.now();
    for (let r = 0; r < reps; r++) run();
    best = Math.min(best, Date.now() - t0);
  }
  return best;
};

/** Enough repetitions for the small input to take about 8 ms, so the clock's 1 ms step is noise. */
const repsFor = (run: () => unknown): number => {
  let reps = 1;
  for (;;) {
    const t0 = Date.now();
    for (let r = 0; r < reps; r++) run();
    if (Date.now() - t0 >= 8 || reps >= 1024) return reps;
    reps *= 2;
  }
};

// R-PARSE-7 (#699): a semicolon run that does not end the text made `/;+$/` retry the run from
// each of its positions. Timed at n and 4n as in preprocess/stress.spec.ts: linear predicts
// ~4x, quadratic ~16x, the bar sits at 8x, and the best of up to five measurements counts.
describe('font family clean-up runs in linear time', () => {
  const run = (n: number) => ';'.repeat(n) + 'x';
  it.each<[string, (stack: string) => unknown]>([
    ['resolveFontFamily', (stack) => resolveFontFamily(stack)],
    ['familyNames', familyNames],
  ])(
    '%s on a long semicolon run',
    (_name, clean) => {
      const small = run(20_000);
      const large = run(80_000);
      const reps = repsFor(() => clean(small));
      let ratio = Infinity;
      for (let attempt = 0; attempt < 5 && ratio >= 8; attempt++) {
        const tSmall = fastest(() => clean(small), reps);
        const tLarge = fastest(() => clean(large), reps);
        ratio = Math.min(ratio, tLarge / Math.max(tSmall, 1));
      }
      expect(ratio).toBeLessThan(8);
    },
    60_000
  );
});
