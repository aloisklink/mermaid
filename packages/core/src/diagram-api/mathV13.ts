import type { MermaidConfig } from '../config.type.js';
import { loadMath, mathOutput, sanitizeText, typesetMath } from '../diagrams/common/common.js';
import { checkStyle } from '../v13/svg/style.js';
import type { InlineBox } from '../v13/svg/writer.js';
import type { InlinePairProvider } from '../v13/text/inline.js';

const CLASS = 'mermaid-math';

/**
 * Draws `$$…$$` in v13 labels with the registered math plugin, as v12 does: sanitized MathML in
 * a `<foreignObject>`. v13's writer only writes allow-listed SVG, so layout gets an empty
 * `<rect>` of the formula's size, and {@link MathV13.mount} swaps it for the formula.
 */
export interface MathV13 {
  readonly provider: InlinePairProvider;
  /** Swaps each placeholder `<rect>` in the mounted `svg` for its formula. */
  mount(svg: SVGSVGElement): void;
}

/**
 * The math provider for one render, or `undefined` without a math plugin, or without MathML and
 * the legacy options.
 */
export async function mathV13(config: MermaidConfig): Promise<MathV13 | undefined> {
  const output = mathOutput(config);
  const katex = output && (await loadMath());
  if (!katex) {
    return undefined;
  }
  const formulas: { style: string; html: string }[] = [];
  const boxes = new Map<string, InlineBox | undefined>();

  /** A `<div>` holding `html` in `style`, as wide as its content. */
  const holder = (doc: Document, html: string, style: string): HTMLDivElement => {
    const div = doc.createElementNS('http://www.w3.org/1999/xhtml', 'div') as HTMLDivElement;
    div.setAttribute('style', `${style}width:fit-content;white-space:nowrap;`);
    div.innerHTML = html;
    return div;
  };

  const provider: InlinePairProvider = {
    open: '$$',
    close: '$$',
    box(source, { font, metrics, warn }) {
      const key = `${font.family}\n${font.size}\n${font.weight}\n${source}`;
      if (boxes.has(key)) {
        return boxes.get(key);
      }
      let typeset: string;
      try {
        typeset = typesetMath(katex, source, output);
      } catch (error) {
        warn({ code: 'MATH_ERROR', message: `Math could not be rendered: ${String(error)}` });
        boxes.set(key, undefined);
        return undefined;
      }
      const html = sanitizeText(typeset, config);
      const family = checkStyle([`font-family:${font.family}`]).text['font-family'] ?? 'sans-serif';
      const style = `font-family:${family};font-size:${font.size}px;font-weight:${font.weight};`;
      const probe = holder(document, html, `position:absolute;visibility:hidden;${style}`);
      document.body.append(probe);
      const { width, height } = probe.getBoundingClientRect();
      probe.remove();
      const index = formulas.push({ style, html }) - 1;
      const box: InlineBox = {
        width,
        height,
        // Centre the formula on the middle of the text.
        baseline: height / 2 + (metrics.ascent - metrics.descent) / 2,
        node: { tag: 'rect', attrs: { class: `${CLASS}-${index}`, width, height, fill: 'none' } },
      };
      boxes.set(key, box);
      return box;
    },
  };

  return {
    provider,
    mount(svg) {
      const doc = svg.ownerDocument;
      for (const [index, { style, html }] of formulas.entries()) {
        for (const rect of svg.querySelectorAll(`rect.${CLASS}-${index}`)) {
          const object = doc.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
          object.setAttribute('width', rect.getAttribute('width') ?? '0');
          object.setAttribute('height', rect.getAttribute('height') ?? '0');
          // Draw the formula in the label's colour, which the writer puts on the box's `<g>`.
          const color = rect.parentElement?.getAttribute('fill');
          object.append(holder(doc, html, `${style}${color ? `color:${color};` : ''}`));
          rect.replaceWith(object);
        }
      }
    },
  };
}
