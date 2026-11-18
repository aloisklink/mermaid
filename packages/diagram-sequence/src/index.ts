/**
 * `@mermaid-js/diagram-sequence`: the sequence diagram plugin (spec #125): the plugin export
 * (`sequence`), the parser, layout and SVG renderer entries, and the model and AST types.
 * Not the package entry: `sequenceDetector.ts` loads `plugin.ts` directly.
 */
import type { DiagramPlugin } from '@mermaid-js/core/v13/index.js';
import type { SequenceModel } from './model.js';
import type { SequenceLayout } from './layout/index.js';

export type * from './model.js';
export { layoutSequence, type SequenceLayout, type SequenceLayoutContext } from './layout/index.js';
export {
  detectSequence,
  JISON_NAMES,
  parseSequence,
  SequenceTokenKind,
  sequenceTokens,
} from './parser/index.js';
export type * from './parser/ast.js';
export { sequence } from './plugin.js';
export { renderSequence, type SequenceRenderContext } from './render/index.js';
export type { SequenceParseOptions, SequenceParseResult, SequenceToken } from './parser/index.js';

/** The plugin's contract. */
export type SequencePlugin = DiagramPlugin<SequenceModel, SequenceLayout>;
