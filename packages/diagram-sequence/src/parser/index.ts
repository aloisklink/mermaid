/**
 * The sequence parser's public surface: the parser, detection, and the lexer gated against
 * v12's jison lexer.
 */
import {
  bodyView,
  COMMENTS,
  cooked,
  keptTokens,
} from '@mermaid-js/core/v13/shared/parser/seen-tokens.js';
import type { SeenToken } from '@mermaid-js/core/v13/shared/parser/seen-tokens.js';
import { lex } from './lexer.js';

export { JISON_NAMES, T as SequenceTokenKind } from './tokens.js';
export { parseSequence } from './parser.js';
export type { SequenceParseOptions, SequenceParseResult } from './parser.js';
export { detectSequence } from './detect.js';
export type * from './ast.js';

/** A token of this diagram: its `kind` is a `SequenceTokenKind` or a shared `Kind`. */
export type SequenceToken = SeenToken;

/**
 * The significant sequence tokens of `src` (comments and directives left out), for editors
 * and for the lexer-parity gate.
 */
export function sequenceTokens(src: string): SequenceToken[] {
  const { bodyStart, view } = bodyView(src);
  const stream = lex(src, bodyStart, view);
  return keptTokens(stream, COMMENTS, cooked(src, stream, view));
}
