import { describe, expect, it } from 'vitest';
import { cook, DROP, firstHole, localOffset, QUOTE, SourceOffsets, sourceView } from './index.js';

describe('sourceView', () => {
  it('cuts line comments out of the text and records them as holes', () => {
    const src = 'a\n  %% note\nb\n';
    const view = sourceView(src, 0, []);
    expect(view.text).toBe('a\nb\n');
    expect(view.holes).toEqual([{ start: 2, end: 12, kind: 'comment' }]);
  });
});

describe('sourceView: removed spans and offsets', () => {
  it('cuts directives and maps text offsets back to the source', () => {
    //           0123456789012345678
    const src = 'a %%{init: {}}%% b';
    const view = sourceView(src, 0, [{ start: 2, end: 16 }]);
    expect(view.text).toBe('a  b');
    expect(view.holes).toEqual([{ start: 2, end: 16, kind: 'directive' }]);
    const at = new SourceOffsets(view.runs ?? new Uint32Array());
    expect([0, 1, 2, 3].map((i) => at.source(i))).toEqual([0, 1, 16, 17]);
    // Backwards too, and a source offset inside the hole maps to the text after it.
    expect(at.source(0)).toBe(0);
    expect(localOffset(view, 17)).toBe(3);
    expect(localOffset(view, 5)).toBe(2);
    expect(firstHole(view, 0)).toBe(0);
    expect(firstHole(view, 16)).toBe(1);
  });

  it('starts at `from`: a comment before it is not removed', () => {
    const src = '%% x\nflowchart\n%% y\nA';
    const view = sourceView(src, 5, []);
    expect(view.holes).toEqual([{ start: 15, end: 20, kind: 'comment' }]);
  });

  it('keeps `%%{` lines and a bare `%%` line, as v12 did', () => {
    const src = '%%{x\n%%\nA';
    expect(sourceView(src, 0, []).holes).toEqual([]);
  });

  it('leaves text with nothing to remove uncopied', () => {
    const view = sourceView('A --> B', 0, []);
    expect(view).toMatchObject({ text: 'A --> B', runs: undefined, mask: undefined, holes: [] });
  });
});

describe('sourceView: tag quotes and dropped semicolons', () => {
  it('marks the quotes of `="x"` inside a tag, which cook reads as apostrophes', () => {
    //           0123456789012
    const src = 'A<b c="d">e</b>';
    const view = sourceView(src, 0, []);
    expect(view.mask?.[6]).toBe(QUOTE);
    expect(view.mask?.[8]).toBe(QUOTE);
    expect(cook(src, 0, src.length, view)).toBe("A<b c='d'>e</b>");
  });

  it('drops the last `;` of a style line with a colour, as encodeEntities did', () => {
    //           0123456789012345678901
    const src = 'style A fill:#f00;x;\nB;';
    const view = sourceView(src, 0, []);
    expect(view.mask?.[19]).toBe(DROP);
    expect(view.mask?.[17]).toBe(0);
    expect(view.holes).toEqual([{ start: 19, end: 20, kind: 'drop' }]);
    expect(view.text).toBe('style A fill:#f00;x\nB;');
  });

  it('drops nothing on a style line without `:…#`', () => {
    expect(sourceView('style A fill:red;', 0, []).holes).toEqual([]);
  });
});

/** The `%%{…}%%` ranges of `src`, as core's preprocess reports them. */
const directivesOf = (src: string) =>
  [...src.matchAll(/%%\{[\s\S]*?\}%%/g)].map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
  }));

// v12 removed directives, then line comments from what was left, then dropped the semicolons
// from that (#185): a directive that starts partway through a line takes its lines with it.
describe('sourceView: directives that start mid-line', () => {
  it.each([
    ['classDiagram\nA %%{init: {\n  %%x "a": 1}}%%\nB', 'classDiagram\nA \nB', {}],
    [
      'flowchart LR\nA %%{init: {\n  %%x "a": 1}}%%\nB',
      'flowchart LR\nA \nB',
      { braceNewline: true },
    ],
  ])('a `%%` line inside one is not a comment: %j', (src, text, options) => {
    const directives = directivesOf(src);
    const view = sourceView(src, 0, directives, options);
    expect(view.text).toBe(text);
    expect(view.holes).toEqual(directives.map((d) => ({ ...d, kind: 'directive' })));
  });

  it.each([
    ['classDiagram\nA : x %%{init: {"a":"style"}}%% :#y;\nB', 'classDiagram\nA : x  :#y;\nB', {}],
    [
      'flowchart LR\nA["x %%{init: {"a":"style"}}%% :#y; z"]\nB',
      'flowchart LR\nA["x  :#y; z"]\nB',
      { braceNewline: true },
    ],
  ])('text inside one does not drop a `;`: %j', (src, cooked, options) => {
    const view = sourceView(src, 0, directivesOf(src), options);
    expect(view.mask?.includes(DROP) ?? false).toBe(false);
    expect(view.holes.map((h) => h.kind)).toEqual(['directive']);
    expect(cook(src, 0, src.length, view)).toBe(cooked);
  });

  it("a `style` that the cut directive completes drops the line's last `;`", () => {
    const src = 'sty%%{init: {}}%%le A fill:#f00;';
    const view = sourceView(src, 0, directivesOf(src));
    expect(view.holes.map((h) => h.kind)).toEqual(['directive', 'drop']);
    expect(view.text).toBe('style A fill:#f00');
  });
});

describe('cook', () => {
  it('decodes entity placeholders and turns CRLF into LF', () => {
    const src = 'x #amp; #35; #a\r\ny';
    expect(cook(src, 0, src.length, sourceView(src, 0, []))).toBe('x &amp; &#35; #a\ny');
  });

  it('keeps a `#name;` core cannot decode as written, and a typed `&name;` too (#777)', () => {
    const src = 'a #colon; #bogus; #fff; &bogus; #1a; #999;';
    expect(cook(src, 0, src.length, sourceView(src, 0, []))).toBe(
      'a &colon; #bogus; #fff; &bogus; #1a; &#999;'
    );
  });

  it('skips a removed span inside the range', () => {
    const src = 'a\n%% c\nb';
    expect(cook(src, 0, src.length, sourceView(src, 0, []))).toBe('a\nb');
  });

  it('keeps a CR and an LF that a removed span left side by side as two line ends', () => {
    // v12 turned the CR into an LF before it removed the comment line.
    const src = 'a\r%% c\n\nb\r\nc';
    expect(cook(src, 0, src.length, sourceView(src, 0, []))).toBe('a\n\nb\nc');
  });
});

describe('SourceOffsets', () => {
  it('starts at the run holding `near`, and still walks both ways', () => {
    const src = 'a\n%% c\nb\n%% d\nc\n%% e\nd';
    const runs = sourceView(src, 0, []).runs ?? new Uint32Array();
    const at = new SourceOffsets(runs, 4);
    expect([4, 5, 0, 2, 6].map((i) => at.source(i))).toEqual([14, 15, 0, 7, 21]);
  });
});

describe('per-diagram options', () => {
  it('marks no tag quotes and drops no `;` when the type did not', () => {
    const src = 'A<b c="d"> style A fill:#f00 x;';
    const view = sourceView(src, 0, [], { tagQuotes: false, styleSemicolons: false });
    expect(view.mask).toBeUndefined();
    expect(view.holes).toEqual([]);
    expect(cook(src, 0, src.length, view)).toBe(src);
  });

  it('collapses `}` then blanks then a line break only when braceNewline is set', () => {
    const src = 'a}  \nb';
    expect(cook(src, 0, src.length, sourceView(src, 0, []))).toBe('a}  \nb');
    expect(cook(src, 0, src.length, sourceView(src, 0, [], { braceNewline: true }))).toBe('a}\nb');
  });
});

/** Fastest of five timings of `reps` runs, in ms (Date.now: core has no Node types). */
const fastest = (run: () => unknown, reps: number): number => {
  let best = Infinity;
  for (let t = 0; t < 5; t++) {
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

// R-PARSE-7: each shape is timed at n and 4n; linear predicts ~4x, quadratic ~16x, the bar is 8x.
describe('source view runs in linear time', () => {
  const run = (src: string) => () =>
    cook(src, 0, src.length, sourceView(src, 0, [], { braceNewline: true }));

  it.each([
    ['style lines', 'style A fill:#f00;;;;\n'],
    ['one style line', 'style A fill:#f00 ;'],
    ['comment lines', '  %% c\n'],
    ['open tags', '<a b="c" d="e"'],
    ['braces and blanks', '}   \n #x; '],
  ])('%s', (_name, unit) => {
    const small = run(unit.repeat(5_000));
    const large = run(unit.repeat(20_000));
    const reps = repsFor(small);
    let ratio = Infinity;
    for (let attempt = 0; attempt < 3 && ratio >= 8; attempt++)
      ratio = Math.min(ratio, fastest(large, reps) / Math.max(fastest(small, reps), 1));
    expect(ratio).toBeLessThan(8);
  });
});
