/**
 * The types of v13's `config/resolve.ts`. v13's config resolution is not ported: a v13 diagram
 * reads v12's config (`getConfig()`), which v12 already merged from `initialize()`, front matter
 * and directives.
 */
import type { MermaidConfig } from '../../config.type.js';

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer U)[]
    ? readonly DeepReadonly<U>[]
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

/** The frozen config every stage of one render reads. */
export type ResolvedConfig = DeepReadonly<MermaidConfig>;
