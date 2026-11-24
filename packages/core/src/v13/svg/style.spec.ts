import { describe, expect, it } from 'vitest';
import {
  checkColor,
  checkStyle,
  px,
  streamWriter,
  styleText,
  themeRef,
  type SvgWarning,
} from './index.js';

const collect = () => {
  const warnings: SvgWarning[] = [];
  return { warnings, warn: (w: SvgWarning) => warnings.push(w) };
};

describe('checkStyle', () => {
  it('splits allowed declarations into shape and text presentation attributes', () => {
    const { warnings, warn } = collect();
    const s = checkStyle(
      [
        'fill:#f9f',
        'stroke:#333',
        'stroke-width:4px',
        'stroke-dasharray: 5, 5',
        'color:red',
        'font-weight:bold',
        'opacity:0.5',
      ],
      warn
    );
    expect(s.shape).toEqual({
      fill: '#f9f',
      stroke: '#333',
      'stroke-width': '4px',
      'stroke-dasharray': '5 5',
      opacity: '0.5',
    });
    expect(s.text).toEqual({ fill: 'red', 'font-weight': 'bold', opacity: '0.5' });
    expect(warnings).toEqual([]);
  });

  it('strips !important and lets later declarations win', () => {
    expect(checkStyle(['fill:red !important', 'fill:blue']).shape).toEqual({ fill: 'blue' });
  });

  it('accepts colour functions and Mermaid variables', () => {
    for (const c of [
      'rgb(1, 2, 3)',
      'rgba(0,0,0,.5)',
      'hsl(120 50% 50%)',
      'oklch(70% 0.1 200)',
      'color-mix(in srgb, red 50%, blue)',
      'var(--mermaid-primaryColor)',
      'var(--_pf, #fff)',
      'transparent',
      '#abcd',
    ]) {
      expect(checkColor(c), c).toBe(c);
    }
  });

  const INJECTIONS = [
    'url(javascript:alert(1))',
    'url (https://evil.example/x.png)',
    'URL(//evil.example/x)',
    'expression(alert(1))',
    'red;background:url(//evil.example/x)',
    'red} body {background:red',
    'red<script>',
    'red/* comment */',
    '@import "x.css"',
    'image-set("x.png" 1x)',
    'javascript:alert(1)',
    'red\\3b background:red',
    'var(--evil)',
    'env(safe-area-inset-top)',
    'attr(data-x)',
    'rgb(1,2,3',
    'red\u0000',
    '"red"',
  ];

  it('drops CSS injection in colour values, with a warning', () => {
    for (const v of INJECTIONS) {
      const { warnings, warn } = collect();
      const s = checkStyle([`fill:${v}`, `stroke:${v}`, `color:${v}`], warn);
      expect(s, v).toEqual({ shape: {}, text: {} });
      expect(
        warnings.map((w) => w.code),
        v
      ).toEqual(['STYLE_VALUE_DROPPED', 'STYLE_VALUE_DROPPED', 'STYLE_VALUE_DROPPED']);
    }
  });

  it('drops unsafe values for every other property', () => {
    for (const prop of [
      'stroke-width',
      'stroke-dasharray',
      'font-size',
      'font-family',
      'font-weight',
      'font-style',
      'opacity',
      'text-decoration',
    ]) {
      for (const v of ['url(x)', '1px;x:y', '1px}', 'expression(1)', 'calc(1px)']) {
        const { warnings, warn } = collect();
        expect(checkStyle([`${prop}:${v}`], warn), `${prop}:${v}`).toEqual({ shape: {}, text: {} });
        expect(warnings).toHaveLength(1);
      }
    }
  });

  it('drops properties that are not on the allow-list, with a warning', () => {
    for (const d of [
      'background:red',
      'background-image:url(x)',
      'marker-end:url(#x)',
      'filter:blur(1px)',
      'behavior:url(x.htc)',
      '-moz-binding:url(x)',
      'content:"x"',
      'display:none',
      '__proto__:x',
      'constructor:x',
      'noColon',
    ]) {
      const { warnings, warn } = collect();
      expect(checkStyle([d], warn), d).toEqual({ shape: {}, text: {} });
      expect(
        warnings.map((w) => w.code),
        d
      ).toEqual(['STYLE_PROPERTY_DROPPED']);
    }
  });

  it('keeps fonts with non-ASCII names and quoted families', () => {
    expect(checkStyle(['font-family:"Trebuchet MS", 微软雅黑, sans-serif']).text).toEqual({
      'font-family': '"Trebuchet MS", 微软雅黑, sans-serif',
    });
  });

  it('writes checked values as presentation attributes', () => {
    const s = checkStyle(['fill:#f9f', 'stroke-width:2px']);
    const w = streamWriter();
    w.leaf('rect', { ...s.shape, width: 1 });
    expect(w.finish()).toBe('<rect fill="#f9f" stroke-width="2px" width="1"/>');
  });
});

describe('themeRef and styleText', () => {
  it('build a root style from checked parts', () => {
    expect(
      styleText({
        'max-width': px(120.5),
        '--_pf': themeRef('--mermaid-primaryColor', checkColor('#ECECFF')),
      })
    ).toBe('max-width:120.5px;--_pf:var(--mermaid-primaryColor,#ECECFF)');
  });

  it('refuse names and values that are not allowed', () => {
    expect(() => themeRef('--a);background:url(x')).toThrow(TypeError);
    expect(() => themeRef('primaryColor')).toThrow(TypeError);
    // @ts-expect-error -- values must be branded
    expect(() => styleText({ background: 'red' })).toThrow(TypeError);
    // @ts-expect-error -- values must be branded
    expect(() => styleText({ fill: 'red;x:url(y)' })).toThrow(TypeError);
  });
});
