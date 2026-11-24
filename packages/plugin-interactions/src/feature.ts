/**
 * One interaction feature (R-PLUG-9, D105): everything about one AST field, from collecting it
 * in `postParse` to binding it in `afterMount`. The plugin is a table of these (`FEATURES` in
 * `index.ts`), so a new feature is one new entry and one new file. A diagram that emits a
 * field an entry already reads (class `callback`, #158) needs no entry of its own.
 */
import type { ExtensionClaim, HookContext } from '@mermaid-js/core/v13/pipeline/extensions.js';
import type { Scope } from './scope.js';

/** What a feature binds for one render: `key` is its content, so equal keys bind once. */
export interface Plan {
  readonly key: string;
  bind(scope: Scope): void;
}

export interface Feature<T> {
  /** The AST field it reads on any node kind (`callback`, `menu`). */
  readonly field: string;
  /** What it claims, so the diagram does not warn about it. */
  readonly claim: ExtensionClaim;
  /** This render's collector state, from the render context (URL options, config). */
  start(ctx: HookContext): T;
  /** One field value, as found on a node. Values of the wrong shape are skipped. */
  collect(value: unknown, acc: T): void;
  /** What to bind, when the svg is mounted (`doc` for page lookups such as `details`). */
  plan(acc: T, doc: Document): Plan;
}

/** A feature with its state type erased, for the table. */
export type AnyFeature = Feature<unknown>;

export function defineFeature<T>(feature: Feature<T>): AnyFeature {
  return feature as unknown as AnyFeature;
}

/** A plain object (not null, not an array). */
export function isBag(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
