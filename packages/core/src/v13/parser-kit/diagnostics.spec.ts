import { describe, expect, it } from 'vitest';
import { Diagnostics, ExpectedTable, FIRST_DIAGRAM_KIND, formatExpected, Kind } from './index.js';

const T = {
  Id: FIRST_DIAGRAM_KIND,
  Arrow: FIRST_DIAGRAM_KIND + 1,
  ThickArrow: FIRST_DIAGRAM_KIND + 2,
  Open: FIRST_DIAGRAM_KIND + 3,
  Semi: FIRST_DIAGRAM_KIND + 4,
  Str: FIRST_DIAGRAM_KIND + 5,
  End: FIRST_DIAGRAM_KIND + 6,
} as const;

const EXPECTED = new ExpectedTable([
  ['a node id', [T.Id, T.Str]],
  ['an arrow such as `-->`', [T.Arrow, T.ThickArrow]],
  ['`[`', [T.Open]],
  ['`;`', [T.Semi]],
  ['`end`', [T.End]],
  ['a line break', [Kind.Newline]],
  ['the end of the diagram', [Kind.EOF]],
]);

describe('Diagnostics', () => {
  it('collects ranged diagnostics with severity, code and message, in order', () => {
    const d = new Diagnostics();
    d.error('UNKNOWN_SHAPE', 'Unknown shape "blob".', { start: 4, end: 8 });
    d.warning('CALLBACK_IGNORED', 'click callbacks need the interactions plugin.', {
      start: 10,
      end: 15,
    });
    expect(d.list).toEqual([
      {
        severity: 'error',
        code: 'UNKNOWN_SHAPE',
        message: 'Unknown shape "blob".',
        range: { start: 4, end: 8 },
      },
      {
        severity: 'warning',
        code: 'CALLBACK_IGNORED',
        message: 'click callbacks need the interactions plugin.',
        range: { start: 10, end: 15 },
      },
    ]);
    expect(d.hasErrors).toBe(true);
  });

  it('points `related` at the opener of an unclosed construct', () => {
    const d = new Diagnostics();
    d.error(
      'UNCLOSED_LABEL',
      'Unclosed node label.',
      { start: 20, end: 20 },
      {
        related: [{ message: 'The label starts here.', range: { start: 3, end: 4 } }],
      }
    );
    expect(d.list[0]?.related).toEqual([
      { message: 'The label starts here.', range: { start: 3, end: 4 } },
    ]);
  });

  it('starts empty and without errors when only warnings exist', () => {
    const d = new Diagnostics();
    expect(d.list).toEqual([]);
    d.warning('W', 'w', { start: 0, end: 0 });
    expect(d.hasErrors).toBe(false);
  });
});

describe('Expected', () => {
  it('groups token kinds into human names in table order, without duplicates', () => {
    expect(EXPECTED.names([T.ThickArrow, T.Str, T.Arrow, T.Id])).toEqual([
      'a node id',
      'an arrow such as `-->`',
    ]);
  });

  it('caps the list at 5 names', () => {
    const all = Object.values(T).concat(Kind.Newline, Kind.EOF);
    expect(EXPECTED.names(all)).toHaveLength(5);
  });

  it('names a single kind for "got …" and falls back to a neutral name', () => {
    expect(EXPECTED.name(T.ThickArrow)).toBe('an arrow such as `-->`');
    expect(EXPECTED.name(999)).toBe('unexpected text');
  });

  it('builds an "expected" diagnostic that carries the grouped names', () => {
    const d = new Diagnostics();
    d.unexpected(
      'UNEXPECTED_TOKEN',
      { start: 2, end: 3 },
      EXPECTED.names([T.Arrow, Kind.Newline]),
      '`[`'
    );
    expect(d.list[0]).toEqual({
      severity: 'error',
      code: 'UNEXPECTED_TOKEN',
      message: 'Expected an arrow such as `-->` or a line break, got `[`.',
      range: { start: 2, end: 3 },
      expected: ['an arrow such as `-->`', 'a line break'],
    });
  });

  it('formats name lists as prose', () => {
    expect(formatExpected(['a'])).toBe('a');
    expect(formatExpected(['a', 'b'])).toBe('a or b');
    expect(formatExpected(['a', 'b', 'c'])).toBe('a, b or c');
  });
});
