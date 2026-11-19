/**
 * The extension plugin contract of v13's `pipeline/extensions.ts`, trimmed to what v13 diagrams
 * run here: `postParse`, `afterMount` and `claims`. v13's other hooks and its hook runner are not
 * ported.
 */
import type { AstNode } from '../parser-kit/ast.js';
import type { RenderContext } from './types.js';

/**
 * Features an extension handles, so a diagram does not warn about them: `callbacks`
 * (`CALLBACK_IGNORED`), `menus` (element menus, `AstMenu`), `icons` (icon packs, D294:
 * `ICON_PACKS_UNSUPPORTED`).
 */
export type ExtensionClaim = 'callbacks' | 'menus' | 'icons';

/** The per-render context hooks get: the frozen render context plus two hook-only fields. */
export interface HookContext extends RenderContext {
  /** The diagram plugin id (`sequence`). A hook written for one diagram type checks it. */
  readonly diagram: string;
  /**
   * This extension's own scratch object for this render: what `postParse` finds (for
   * example click callbacks) and `afterMount` needs. Not shared with other extensions.
   */
  readonly state: Record<string, unknown>;
}

/**
 * An extension plugin (DESIGN §12.2). `El` and `R` are the DOM element and the render
 * result `afterMount` gets.
 */
export interface ExtensionPlugin<El = unknown, R = unknown> {
  readonly id: string;
  /** Data in, data out: returns the AST the next hook sees. */
  postParse?(ast: AstNode, ctx: HookContext): AstNode;
  /**
   * Runs from the render result's `bindFunctions`, once the svg is in the DOM. `state` is what
   * this extension's `postParse` stored.
   */
  afterMount?(el: El, result: R, state: Record<string, unknown>): void;
  readonly claims?: readonly ExtensionClaim[];
}
