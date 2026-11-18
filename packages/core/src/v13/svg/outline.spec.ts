import { describe, expect, it } from 'vitest';
import {
  inertProblem,
  streamWriter,
  treeWriter,
  type Attrs,
  type PathData,
  type SvgWriter,
  type WriterOptions,
} from './index.js';
import { outlineFixture } from './testing/index.js';

/** Writes `program` on both backings and returns both outputs. */
function both(program: (w: SvgWriter) => void, options?: WriterOptions): [string, string] {
  const s = streamWriter(options);
  program(s);
  const t = treeWriter(options);
  program(t);
  return [s.finish(), t.finish()];
}

const RECT: Attrs = { class: 'basic', x: -20, y: -10, width: 40, height: 20, rx: 3 };

describe('SvgWriter.outline', () => {
  it('writes exactly what leaf writes when no drawer is installed', () => {
    const outlined = both((w) => {
      w.open('g', { class: 'node' });
      w.outline('node', 'rect', RECT);
      w.outline('edge', 'path', { d: w.path().moveTo(0, 0).lineTo(5, 5).done() });
      w.outline('mark', 'circle', { cx: 1, cy: 2, r: 3 });
      w.outline('divider', 'line', { x1: 0, y1: 0, x2: 4, y2: 0 });
      w.close();
    });
    expect(outlined[0]).toBe(
      '<g class="node"><rect class="basic" x="-20" y="-10" width="40" height="20" rx="3"/>' +
        '<path d="M0,0L5,5"/><circle cx="1" cy="2" r="3"/><line x1="0" y1="0" x2="4" y2="0"/></g>'
    );
    expect(outlined[1]).toBe(outlined[0]);
  });
});

describe('the fixture drawer (@mermaid-js/core/svg/testing)', () => {
  const drawn = both(
    (w) => {
      w.open('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: [0, 0, 50, 50] });
      w.outline('node', 'rect', RECT);
      w.outline('mark', 'circle', { cx: 1, cy: 2, r: 3, fill: 'none' });
      w.outline('divider', 'line', { x1: 0, y1: 0, x2: 4, y2: 0, class: 'divider' });
      w.outline('part', 'polygon', { points: [0, 0, 10, 0, 5, 8] });
      w.outline('group', 'ellipse', { cx: 5, cy: 5, rx: 4, ry: 2 });
      w.outline('edge', 'path', { d: 'M0,0L9,9' as PathData, class: 'flowchart-link' });
      w.close();
    },
    { outline: outlineFixture.draw }
  );

  it('wraps each outline in <g class="outline-<role>"> around one <path>', () => {
    expect(drawn[0]).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50">' +
        '<g class="outline-node"><path class="basic" d="M-20,-10L20,-10L20,10L-20,10Z"/></g>' +
        '<g class="outline-mark"><path fill="none" d="M-2,2A3,3 0 0,1 4,2A3,3 0 0,1 -2,2Z"/></g>' +
        '<g class="outline-divider"><path class="divider" d="M0,0L4,0"/></g>' +
        '<g class="outline-part"><path d="M0,0L10,0L5,8Z"/></g>' +
        '<g class="outline-group"><path d="M1,5A4,2 0 0,1 9,5A4,2 0 0,1 1,5Z"/></g>' +
        '<g class="outline-edge"><path class="flowchart-link" d="M0,0L9,9"/></g>' +
        '</svg>'
    );
    expect(drawn[1]).toBe(drawn[0]);
  });

  it('passes the allow-list', () => {
    expect(inertProblem(drawn[0])).toBeUndefined();
  });

  it('is active in every render', () => {
    expect(outlineFixture.active()).toBe(true);
  });
});
