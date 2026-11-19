import type { MermaidConfig } from '../config.type.js';
import type { Diagram } from '../Diagram.js';
import { log } from '../logger.js';
import { selectSvgElement } from '../rendering-util/selectSvgElement.js';
import { checkOutput, checkSource, type Limits, resolveLimits } from '../v13/limits/index.js';
import { pxProfile } from '../v13/layout/units.js';
import { selectMeasurer } from '../v13/mermaid/measurer.js';
import { errorFromDiagnostics } from '../v13/pipeline/errors.js';
import type { RenderContext, Warning } from '../v13/pipeline/types.js';
import type { ParseResult } from '../v13/parser-kit/result.js';
import { preprocess } from '../v13/preprocess/index.js';
import { resolveSecurityLevel } from '../v13/svg/url.js';
import { streamWriter } from '../v13/svg/writer.js';
import { getConfig } from './diagramAPI.js';
import { themeFromV12 } from './themeV13.js';
import type { DiagramDB, DiagramDefinition, DiagramDefinitionV13 } from './types.js';

const warn = (w: Warning): void => log.warn(`${w.code}: ${w.message}`);

/** Holds a parse result until `draw`. */
class DiagramV13DB implements DiagramDB {
  readonly parsesRawSource = true;
  parsed?: { result: ParseResult<unknown>; config: MermaidConfig; limits: Readonly<Limits> };
}

/** Moves the attributes and children of `markup`'s root into v12's `<svg id>`, keeping v12's `<style>`. */
function mountSvg(id: string, markup: string): void {
  const target = selectSvgElement(id).node();
  if (!target) {
    throw new Error(`No <svg> element with id "${id}" to draw into`);
  }
  const source = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
  for (const { name, value } of source.attributes) {
    target.setAttribute(name, value);
  }
  target.setAttribute('id', id);
  // Keep v12's <style>, drop its empty <g>.
  for (const child of [...target.children]) {
    if (child.tagName.toLowerCase() !== 'style') {
      child.remove();
    }
  }
  target.append(
    ...[...source.childNodes].map((node) => target.ownerDocument.importNode(node, true))
  );
  // Give the accessible title and description v12's ids, as other diagrams have.
  for (const [tag, aria] of [
    ['title', 'aria-labelledby'],
    ['desc', 'aria-describedby'],
  ] as const) {
    const element = target.querySelector(`:scope > ${tag}`);
    if (element) {
      element.id = `chart-${tag}-${id}`;
      target.setAttribute(aria, element.id);
    }
  }
}

/** Wraps a {@link DiagramDefinitionV13} so that v12's render pipeline can draw it. */
export function fromDefinitionV13(definition: DiagramDefinitionV13): DiagramDefinition {
  // `Diagram.fromText` sets `parser.parser.yy` to the diagram's db, as for jison parsers.
  const parser = {
    parser: { yy: new DiagramV13DB() },
    parse(text: string) {
      const config = getConfig();
      // v12's `maxEdges` (500 by default) is for flowcharts: v13 counts sequence messages too.
      const limits = resolveLimits({ maxTextSize: config.maxTextSize });
      checkSource(text, limits);
      const preprocessed = preprocess(text);
      const result = definition.parse(text, { config, preprocessed, limits });
      const diagnostics = [...preprocessed.diagnostics, ...result.diagnostics];
      const error = errorFromDiagnostics(text, diagnostics);
      if (error) {
        throw error;
      }
      diagnostics.forEach(warn);
      parser.parser.yy.parsed = { result, config, limits };
    },
  };
  return {
    get db() {
      return new DiagramV13DB();
    },
    parser,
    // v13 diagrams style their SVG themselves.
    styles: () => '',
    renderer: {
      draw: (_text: string, id: string, version: string, diagram: Diagram) => {
        const { parsed } = diagram.db as DiagramV13DB;
        if (!parsed) {
          throw new Error(`The ${definition.id} diagram was drawn before it was parsed`);
        }
        const { result, config, limits } = parsed;
        const ctx: RenderContext = {
          config,
          measurer: selectMeasurer(),
          units: pxProfile,
          theme: themeFromV12(config, definition.theme),
          securityLevel: resolveSecurityLevel(config.securityLevel, warn),
          idPrefix: id,
          version,
          limits,
          // Graph layout engines are not ported: v13 diagrams lay themselves out.
          layout: () => {
            throw new Error(`The ${definition.id} diagram has no graph layout`);
          },
          warn,
        };
        const layout = definition.layout?.(result.model, ctx);
        const w = streamWriter({ idPrefix: () => id });
        definition.render(result.model, layout, ctx, w);
        const svg = w.finish();
        checkOutput(svg, limits);
        mountSvg(id, svg);
      },
    },
  };
}
