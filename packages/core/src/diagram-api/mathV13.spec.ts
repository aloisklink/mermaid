import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MermaidConfig } from '../config.type.js';
import { setMathRendererLoader } from '../diagrams/common/common.js';
import type { FontKey, Measurer } from '../v13/text/measurer.js';
import { mathV13 } from './mathV13.js';

const font = { family: 'serif', size: 16, weight: 400 } as FontKey;
const request = (warn = vi.fn()) => ({
  font,
  measurer: {} as Measurer,
  metrics: { ascent: 12, descent: 4, lineHeight: 19 },
  ex: 8,
  warn,
  scratch: {},
});
const config: MermaidConfig = { securityLevel: 'strict' };

beforeEach(() => {
  vi.stubGlobal('MathMLElement', class {});
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 30,
    height: 20,
  } as DOMRect);
  setMathRendererLoader(() =>
    Promise.resolve({
      renderToString: (tex) => {
        if (tex === 'bad') {
          throw new Error('Undefined control sequence');
        }
        return `<math><mi>${tex}</mi><img src="x" onerror="alert(1)"></math>`;
      },
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('mathV13', () => {
  it('draws nothing where the browser has no MathML and the legacy options are off', async () => {
    vi.stubGlobal('MathMLElement', undefined);
    expect(await mathV13(config)).toBeUndefined();
  });

  it('sizes a formula, then swaps its placeholder for sanitized MathML in the label paint', async () => {
    const math = (await mathV13(config))!;
    const box = math.provider.box('x^2', request())!;
    expect(box).toMatchObject({ width: 30, height: 20, baseline: 14 });

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('fill', '#123456');
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    for (const [name, value] of Object.entries(box.node.attrs!)) {
      rect.setAttribute(name, String(value));
    }
    g.append(rect);
    svg.append(g);
    math.mount(svg);

    const object = g.querySelector('foreignObject')!;
    expect(g.querySelector('rect')).toBeNull();
    expect(object.getAttribute('width')).toBe('30');
    expect(object.innerHTML).toContain('<mi>x^2</mi>');
    expect(object.innerHTML).not.toContain('onerror');
    expect(object.firstElementChild!.getAttribute('style')).toContain('color:#123456;');
  });

  it('keeps a font family that is not one CSS value out of the style', async () => {
    const math = (await mathV13(config))!;
    const evil = { ...font, family: 'a\n<img src=x onerror=alert(1)>;color:red' } as FontKey;
    const box = math.provider.box('y', { ...request(), font: evil })!;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('class', String(box.node.attrs!.class));
    svg.append(rect);
    math.mount(svg);
    const div = svg.querySelector('foreignObject > div')!;
    expect(div.getAttribute('style')).toMatch(/^font-family:sans-serif;/);
    expect(svg.innerHTML).not.toContain('onerror');
  });

  it('warns and declines TeX that KaTeX rejects', async () => {
    const warn = vi.fn();
    expect((await mathV13(config))!.provider.box('bad', request(warn))).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ code: 'MATH_ERROR' }));
  });
});
