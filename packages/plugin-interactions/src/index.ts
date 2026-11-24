/**
 * mermaid-v13's interactions extension (`index.ts`, DESIGN §12.3, R-PLUG-9, D105) without click
 * callbacks: flowchart, class and gantt are v12 diagrams here and bind their own. What remains
 * is the sequence actor menus (`menus.ts`).
 *
 * `FEATURES` is a table of features, each owning one AST field (`feature.ts`). `postParse`
 * collects the fields in one walk; `afterMount`, run by `bindFunctions`, binds them in each
 * diagram root svg of the element (`scope.ts`). Binding is keyed on content per svg: the same
 * menus bind once, different ones replace the old.
 */
import type { ExtensionPluginV13, MermaidPlugin } from '@mermaid-js/core';
import type { AstNode } from '@mermaid-js/core/v13/parser-kit/index.js';
import type { AnyFeature } from './feature.js';
import { menus } from './menus.js';
import { createScope, rootsFor } from './scope.js';

/** Every feature, in binding order. A new interaction feature is a new entry here. */
const FEATURES: readonly AnyFeature[] = [menus];

/** What `postParse` hands to `afterMount`: each feature's collected state, by table index. */
interface InteractionState {
  collected?: unknown[];
}

/** What each diagram root svg has bound: the content key and how to undo it. */
const boundRoots = new WeakMap<Element, { key: string; teardown: () => void }>();

function walk(node: AstNode, visit: (node: AstNode) => void): void {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

/** The extension itself; register the default export. */
export const interactions: ExtensionPluginV13['extension'] = {
  id: 'interactions',
  claims: FEATURES.map((f) => f.claim),
  postParse(ast, ctx) {
    // As in v12, menus need `securityLevel: 'loose'` (here forced menus do too).
    if (ctx.securityLevel !== 'loose') return ast;
    const collected = FEATURES.map((f) => f.start(ctx));
    walk(ast, (node) => {
      const fields = node as unknown as Record<string, unknown>;
      FEATURES.forEach((f, i) => {
        if (fields[f.field] !== undefined) f.collect(fields[f.field], collected[i]);
      });
    });
    (ctx.state as InteractionState).collected = collected;
    return ast;
  },
  afterMount(el, result, state) {
    const { collected } = state as InteractionState;
    if (collected === undefined) return;
    const plans = FEATURES.map((f, i) => f.plan(collected[i], el.ownerDocument));
    const key = JSON.stringify(plans.map((p) => p.key));
    for (const svg of rootsFor(el, result.svg)) {
      const before = boundRoots.get(svg);
      if (before?.key === key) continue;
      before?.teardown();
      const { scope, teardown } = createScope(svg);
      for (const p of plans) p.bind(scope);
      boundRoots.set(svg, { key, teardown });
    }
  },
};

/** The interactions extension, to pass to `mermaid.registerPlugins`. */
const plugins: MermaidPlugin[] = [{ type: 'extension', extension: interactions }];

export default plugins;
