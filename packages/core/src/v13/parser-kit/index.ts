/**
 * Parser kit (DESIGN §4.2): building blocks for hand-written lexers and recursive-descent
 * parsers. There is no grammar abstraction. Nothing here holds module-level mutable state;
 * every stateful helper is an instance created per parse.
 */
export { FIRST_DIAGRAM_KIND, Kind, tokenText, TokenWriter } from './tokens.js';
export type { TokenKind, TokenStream } from './tokens.js';
export { kindCategories, SHARED_CATEGORIES, TOKEN_CATEGORIES } from './categories.js';
export type { TokenCategory } from './categories.js';
export {
  charTable,
  codePointEnd,
  hasClass,
  isBlank,
  isDigit,
  isHex,
  isLetter,
  isLineEnd,
  isSpace,
  isUnicodeLetter,
  isWord,
} from './chars.js';
export * from './char-codes.js';
export { execAt, lineEnd, matchAt, newlineAt, scanWhile } from './scanner.js';
export { closingLine, endsInBrace, openerBrace } from './embed-block.js';
export { MAX_BLOCK_DEPTH, openerRange, tooDeep } from './embed-depth.js';
export { LineIndex } from './positions.js';
export type { Position, Range } from './positions.js';
export { Diagnostics, ExpectedTable, formatExpected, MAX_EXPECTED } from './diagnostics.js';
export type { Diagnostic, DiagnosticExtra, RelatedInfo, Severity } from './diagnostics.js';
export { formatDiagnostic } from './format.js';
export { inKindSet, kindSet, ProbeCursor, TokenCursor, TRIVIA } from './cursor.js';
export { Probe } from './probe.js';
export type { ProbeResult } from './probe.js';
export type { KindSet } from './cursor.js';
export { syncTo } from './recovery.js';
export { significantTokens, skipTo } from './view.js';
export type { TokenView } from './view.js';
export { AstIds, nodeId } from './ast.js';
export type { AstCallback, AstId, AstMenu, AstNode } from './ast.js';
export { ParseState } from './result.js';
export type {
  EmbeddedBlock,
  ParseOptions,
  ParseResult,
  StatementSpan,
  SymbolOccurrence,
} from './result.js';
export {
  cook,
  DROP,
  firstHole,
  localOffset,
  QUOTE,
  SourceOffsets,
  sourceView,
} from './source-view.js';
export type { Hole, SourceView, SourceViewOptions } from './source-view.js';
export type {
  CompletionItem,
  CompletionKind,
  DocumentView,
  FacetParseOptions,
  Hover,
  HoverTarget,
  LanguageFacet,
  NameSyntax,
} from './language.js';
export { Stop, STOP } from './stop.js';
