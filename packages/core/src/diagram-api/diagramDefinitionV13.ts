import type { MermaidConfig } from '../config.type.js';
import type { Diagram } from '../Diagram.js';
import { log } from '../logger.js';
import { type ExtensionRenderResult, getExtensionsV13 } from '../plugins.js';
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
import { inlineSpans } from '../v13/text/inline.js';
import { getConfig } from './diagramAPI.js';
import { mathV13 } from './mathV13.js';
import { themeFromV12 } from './themeV13.js';
import type { DiagramDB, DiagramDefinition, DiagramDefinitionV13 } from './types.js';

const warn = (w: Warning): void => log.warn(`${w.code}: ${w.message}`);

/** Holds a parse result until `draw`, and the `bindFunctions` that `draw` sets. */
class DiagramV13DB implements DiagramDB {
  readonly parsesRawSource = true;
  parsed?: { result: ParseResult<unknown>; config: MermaidConfig; limits: Readonly<Limits> };
}

/** A registered extension and its scratch state for one render. */
interface ExtensionRun {
  extension: ReturnType<typeof getExtensionsV13>[number];
  state: Record<string, unknown>;
}

/**
 * The `bindFunctions` that runs the extensions' `afterMount` hooks, or `undefined` when none has
 * one. Built outside `draw` so that the returned closure does not keep `draw`'s locals alive.
 */
function afterMountHooks(
  runs: readonly ExtensionRun[],
  result: ExtensionRenderResult
): DiagramDB['bindFunctions'] {
  const mounts = runs.filter(({ extension }) => extension.afterMount !== undefined);
  if (mounts.length === 0) {
    return undefined;
  }
  return (element) => {
    for (const { extension, state } of mounts) {
      extension.afterMount?.(element, result, state);
    }
  };
}

/** Moves the attributes and children of `markup`'s root into v12's `<svg id>`, keeping v12's `<style>`. */
function mountSvg(id: string, markup: string): SVGSVGElement {
  const target = selectSvgElement(id).node();
  if (!target) {
    throw new Error(`No <svg> element with id "${id}" to draw into`);
  }
  const source = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
  for (const { name, value } of source.attributes) {
    target.setAttribute(name, value);
  }
  // Drop v13's `mermaid` class, or a later `mermaid.run()` would render this <svg> as diagram text.
  target.classList.remove('mermaid');
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
    const element = [...target.children].find((child) => child.tagName.toLowerCase() === tag);
    if (element) {
      element.id = `chart-${tag}-${id}`;
      target.setAttribute(aria, element.id);
    }
  }
  return target;
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
      const claims = getExtensionsV13().flatMap((extension) => extension.claims ?? []);
      const result = definition.parse(text, { config, preprocessed, claims, limits });
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
      draw: async (text: string, id: string, version: string, diagram: Diagram) => {
        const { parsed } = diagram.db as DiagramV13DB;
        if (!parsed) {
          throw new Error(`The ${definition.id} diagram was drawn before it was parsed`);
        }
        const { result, config, limits } = parsed;
        // Only load the math plugin for a diagram that may have math, as v12 does.
        const math = text.includes('$$') ? await mathV13(config) : undefined;
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
          inline: inlineSpans(math ? [math.provider] : [], warn),
        };
        const runs: ExtensionRun[] = getExtensionsV13().map((extension) => ({
          extension,
          state: {},
        }));
        let ast = result.ast;
        for (const { extension, state } of runs) {
          ast = extension.postParse?.(ast, { ...ctx, diagram: definition.id, state }) ?? ast;
        }
        const layout = definition.layout?.(result.model, ctx);
        const w = streamWriter({ idPrefix: () => id });
        definition.render(result.model, layout, ctx, w);
        const svg = w.finish();
        checkOutput(svg, limits);
        const mounted = mountSvg(id, svg);
        math?.mount(mounted);
        diagram.db.bindFunctions = afterMountHooks(runs, { svg });
      },
    },
  };
}
