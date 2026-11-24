import { describe, expect, it } from 'vitest';
import { LineIndex } from './index.js';

describe('LineIndex (source positions)', () => {
  it('maps original offsets to 0-based line/column, treating CRLF, LF and CR as one break each', () => {
    const src = 'ab\r\ncd\nef\rgh';
    const idx = new LineIndex(src);
    expect(idx.lineCount).toBe(4);
    expect(idx.position(0)).toEqual({ line: 0, column: 0 });
    expect(idx.position(2)).toEqual({ line: 0, column: 2 }); // the \r
    expect(idx.position(4)).toEqual({ line: 1, column: 0 }); // c
    expect(idx.position(8)).toEqual({ line: 2, column: 1 }); // f
    expect(idx.position(10)).toEqual({ line: 3, column: 0 }); // g
    expect(idx.position(src.length)).toEqual({ line: 3, column: 2 });
  });

  it('maps line/column back to offsets and clamps out-of-range input', () => {
    const src = 'ab\r\ncd\nef';
    const idx = new LineIndex(src);
    expect(idx.offset(1, 1)).toBe(5);
    expect(idx.offset(2, 0)).toBe(7);
    expect(idx.offset(0, 99)).toBe(2); // end of line 0, before its break
    expect(idx.offset(99, 0)).toBe(src.length);
    expect(idx.position(-5)).toEqual({ line: 0, column: 0 });
  });

  it('keeps front-matter and directive offsets as they are: there is no rewritten source', () => {
    const src = '---\ntitle: x\n---\n%%{init: {}}%%\ngraph TD\n';
    const at = src.indexOf('graph');
    expect(new LineIndex(src).position(at)).toEqual({ line: 4, column: 0 });
  });
});
