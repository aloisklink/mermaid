/**
 * The token list a diagram's `xxxTokens()` gives the language service and the lexer-parity specs
 * (R-LANG-7), as each `parser/index.ts` used to compute it by hand. The langium family lists
 * what v12's lexer saw ({@link seenTokens}); the jison family leaves out a set of kinds
 * ({@link keptTokens}).
 */
import { cook, inKindSet, Kind, kindSet, sourceView } from '../../parser-kit/index.js';
import type { KindSet, Range, SourceView, TokenStream, TokenView } from '../../parser-kit/index.js';
import { preprocess } from '../../preprocess/index.js';
import type { PreprocessResult } from '../../preprocess/index.js';

export interface SeenToken {
  /** The diagram's own token kind, or a shared `Kind`. */
  kind: number;
  /**
   * The token's text as v12's lexer read it. Through {@link cooked}: CRLF and CR as LF, removed
   * spans cut out, tag quotes as `'`, entities decoded to `&name;` as v12's renderer did.
   */
  text: string;
  range: Range;
}

/** The text of token `j`. */
export type TokenText = (j: number) => string;

/** Each token's text `cook()`ed from `src` through `view`, as v12's lexer read it. */
export function cooked(src: string, tokens: TokenView, view: SourceView): TokenText {
  return (j) => cook(src, tokens.start[j] ?? 0, tokens.end[j] ?? 0, view);
}

function tokenAt(tokens: TokenView, j: number, text: TokenText): SeenToken {
  const range = { start: tokens.start[j] ?? 0, end: tokens.end[j] ?? 0 };
  return { kind: tokens.kind[j] ?? Kind.EOF, text: text(j), range };
}

/**
 * The indices into `stream`, lexed through `view`, of the tokens v12's lexer saw, in order:
 * significant tokens, the hidden comments and directives still in the text v12 lexed, and
 * `Error` where no rule matched. A comment or directive token that is exactly a span v12 removed
 * before lexing is left out, and so is the final `EOF`.
 */
export function seenIndices(stream: TokenStream, view: SourceView): number[] {
  const removed = view.holes.filter((h) => h.kind !== 'drop');
  let h = 0;
  const out: number[] = [];
  for (let j = 0; j < stream.length; j++) {
    const kind = stream.kind[j] ?? Kind.EOF;
    const start = stream.start[j] ?? 0;
    const end = stream.end[j] ?? 0;
    if (kind === Kind.EOF) continue;
    while ((removed[h]?.start ?? Infinity) < start) h++;
    const hole = removed[h];
    const trivia = kind === Kind.Comment || kind === Kind.Directive;
    // A span v12 removed before lexing: its lexer never saw it.
    if (trivia && hole?.start === start && hole.end === end) continue;
    out.push(j);
  }
  return out;
}

/** The tokens at {@link seenIndices}, each with its text `cook()`ed from `src`. */
export function seenTokens(src: string, stream: TokenStream, view: SourceView): SeenToken[] {
  const text = cooked(src, stream, view);
  return seenIndices(stream, view).map((j) => tokenAt(stream, j, text));
}

/** A diagram's lexer over `src[from…]`, through the v12 source view. */
export type ViewLexer = (src: string, from: number, view: SourceView) => TokenStream;

/** Core's preprocess of a source, where its body starts, and the view of that body. */
export interface BodyView {
  pre: PreprocessResult;
  bodyStart: number;
  view: SourceView;
}

/**
 * `src` as most v12 lexers read it: core's preprocess (front matter, directives) and the source
 * view over the body with default options (v12 ran every shared rewrite).
 */
export function bodyView(src: string): BodyView {
  const pre = preprocess(src);
  const view = sourceView(
    src,
    pre.bodyStart,
    pre.directives.map((d) => d.range)
  );
  return { pre, bodyStart: pre.bodyStart, view };
}

/** {@link seenTokens} of `src`, lexed by `lex` from the body start over {@link bodyView}. */
export function bodyTokens(src: string, lex: ViewLexer): SeenToken[] {
  const { bodyStart, view } = bodyView(src);
  return seenTokens(src, lex(src, bodyStart, view), view);
}

/**
 * Comments and directives: what a jison-family token list leaves out when it keeps blanks. With
 * blanks too, pass core's `TRIVIA`.
 */
export const COMMENTS: KindSet = /* @__PURE__ */ kindSet(Kind.Comment, Kind.Directive);
/** No kind: every token but the final `EOF`. */
export const NO_KINDS: KindSet = /* @__PURE__ */ kindSet();

/**
 * The tokens of `tokens` whose kind is not in `skip`, in order, without the final `EOF`. The
 * check is one array read per token.
 */
export function keptTokens(tokens: TokenView, skip: KindSet, text: TokenText): SeenToken[] {
  const out: SeenToken[] = [];
  for (let j = 0; j < tokens.length; j++) {
    const kind = tokens.kind[j] ?? Kind.EOF;
    if (kind === Kind.EOF || inKindSet(skip, kind)) continue;
    out.push(tokenAt(tokens, j, text));
  }
  return out;
}
