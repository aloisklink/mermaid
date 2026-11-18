import { describe, expect, it } from 'vitest';
import { formatDiagnostic } from './index.js';

describe('formatDiagnostic', () => {
  it('shows the line with a caret under the range, the expectations and related ranges', () => {
    const src = 'flowchart TD\n  A[one\n  B --> C\n';
    const text = formatDiagnostic(src, {
      severity: 'error',
      code: 'UNCLOSED',
      message: 'Unclosed node label.',
      range: { start: 16, end: 17 },
      expected: ['`]`'],
      related: [{ message: 'The text ends here.', range: { start: 32, end: 32 } }],
    });
    expect(text).toBe(
      [
        'Error at line 2, column 4: Unclosed node label.',
        '2 |   A[one',
        '  |    ^',
        'Expected: `]`',
        'Note at line 4, column 1: The text ends here.',
        '4 | ',
        '  | ^',
      ].join('\n')
    );
  });

  it('keeps the caret on the line with CRLF breaks and clips ranges to the line', () => {
    const src = 'a\r\nbcd\r\ne';
    const text = formatDiagnostic(src, {
      severity: 'warning',
      code: 'X',
      message: 'm',
      range: { start: 4, end: 9 },
    });
    expect(text).toBe(['Warning at line 2, column 2: m', '2 | bcd', '  |  ^^'].join('\n'));
  });
});
