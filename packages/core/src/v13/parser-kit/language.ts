/**
 * The language facet (DESIGN §4.5, R-LANG-8, D89): what a diagram package exports from its
 * `./language` subpath so the language service can support that type. It is built on parser
 * kit outputs only and imports no renderer code.
 *
 * It lives here, not in `@mermaid-js/language-service`, because diagram packages import only
 * core (DESIGN §2); the service re-exports it.
 */
import type { AstNode } from './ast.js';
import type { TokenCategory } from './categories.js';
import type { Range } from './positions.js';
import type { ProbeResult } from './probe.js';
import type { ParseResult, SymbolOccurrence } from './result.js';
import type { TokenKind } from './tokens.js';

/** Options the service parses with: tokens are always kept; `probe` is the completion offset. */
export interface FacetParseOptions {
  keepTokens: true;
  /** UTF-16 offset to record expectations at (R-LANG-7, D95). */
  probe?: number;
}

/**
 * What the facet's completion and hover read of a document (DESIGN §4.5). Read-only: for
 * hover it is the snapshot's own parse, which the service has frozen (D90) where its memoised
 * queries read it; a facet never changes it.
 */
export interface DocumentView<A extends AstNode = AstNode> {
  /** The whole text; every range is a UTF-16 offset into it. */
  readonly text: string;
  /**
   * The parse of `text` with tokens kept: for `hover`, the snapshot's (no probe); for
   * `completions`, the probe parse the `ProbeResult` came from.
   */
  readonly result: ParseResult<unknown, A>;
}

/** What is under the cursor for hover (D93). */
export interface HoverTarget {
  /** The hover offset. */
  readonly offset: number;
  /**
   * The token of `doc.result.tokens` under the offset (one containing it, else one ending at
   * it), when there is one that is not a blank or line break. Without one the facet may still
   * read the text (a keyword its lexer emits no token for).
   */
  readonly token?: { readonly kind: TokenKind; readonly range: Range };
  /** The parser's symbol occurrence under the offset, when there is one. */
  readonly symbol?: SymbolOccurrence;
}

/** One diagram type's language knowledge. */
export interface LanguageFacet<A extends AstNode = AstNode> {
  /** The diagram id, e.g. `flowchart`. */
  readonly id: string;
  /**
   * Parse the whole document `text` (front matter and directives included; every range is an
   * offset into it) with tokens kept, and record expectations at `options.probe` when given.
   *
   * Contract with the service:
   * - Diagnostics: the facet's own, in source order, N errors in, N out. Preprocess
   *   diagnostics (`YAML_*`, `INVALID_DIRECTIVE`, …) need not be repeated: the service merges
   *   `preprocess(text).diagnostics` in itself and drops one the facet also reports (same
   *   code and range), so a facet that already includes them (flowchart) is fine too.
   * - Never throws on any text. If it does, the service shows `LANGUAGE_FACET_FAILED` and
   *   serves generic features only for that text.
   * - Pure and synchronous: the same text gives the same result; nothing is kept between
   *   calls, and the service never mutates the result.
   */
  parse(text: string, options: FacetParseOptions): ParseResult<unknown, A>;
  /** Highlight category of every token kind the parser emits (D94). */
  readonly categories: Readonly<Record<TokenKind, TokenCategory>>;
  /**
   * Symbol kinds that share one name space: an occurrence's definition, references and
   * rename cover every kind in its group (D92).
   */
  readonly namespaces: readonly (readonly string[])[];
  /**
   * Symbol kinds whose every occurrence is a symbol of its own, though names repeat (mindmap
   * node ids, D289): definition and references give the occurrence alone, rename changes only
   * it, and another occurrence with the new name is no clash. None when omitted.
   */
  readonly standalone?: readonly string[];
  /**
   * When true, only a `def` occurrence defines a symbol: a name the parser records only as
   * `ref`s (a cynefin domain no block declares, D367) has no definition, and all its mentions
   * are references. When absent or false, such a name's first mention is its definition.
   */
  readonly declaredOnly?: boolean;
  /**
   * `undefined` when `name` can be used as an identifier of symbol kind `kind` (a kind the
   * parser records, e.g. `node`, `class`, `edge`; the facet's main id kind when omitted),
   * else the reason it cannot (D92).
   */
  isValidId(name: string, kind?: string): string | undefined;
  /**
   * `name` written so the parser reads it as one name of kind `kind` where {@link isValidId}
   * refuses it unquoted: a rename writes this at each unquoted occurrence (wardley's
   * `"notebook"`, D427), and the text between the quotes must be `name` itself (D191). Return
   * `undefined` when no quoting holds `name` as written. When omitted, such a rename is refused
   * with the reason `isValidId` gives.
   */
  quoteId?(name: string, kind?: string): string | undefined;
  /**
   * The written name: how `name`, which {@link isValidId} accepts, is written where a bare
   * occurrence of symbol kind `kind` stands, which is what a rename puts there; `name` itself
   * when omitted ({@link quoteId} covers a name `isValidId` refuses unquoted). A facet whose names
   * may also be written quoted gives the quoted form where bare text cannot hold the name
   * (xychart, D389: a category renamed to `Q1 2024` is written `"Q1 2024"`). A quoted occurrence
   * keeps its quotes and takes `name` between them (D191); the read-back check still has the
   * last word.
   */
  writtenName?(name: string, kind: string): string;
  /**
   * How names are written, when the service's own reading does not fit (sankey's CSV fields,
   * D398). Without it the service takes an occurrence whose range is its name, or its name
   * inside one of the quote pairs it knows with nothing escaped, and a rename writes the new
   * name as {@link writtenName} and {@link quoteId} give it. With it, see {@link NameSyntax}
   * (which then writes every rename).
   */
  readonly nameSyntax?: NameSyntax;
  /**
   * Completion items at the probe (D95): `probe` is `ParseResult.probe` of a parse of
   * `doc.text` with `probe: offset`. Items are filtered by the probe's prefix.
   */
  completions(probe: ProbeResult, doc: DocumentView<A>): CompletionItem[];
  /** Hover for what is under the cursor (D93); keyword docs come from the syntax reference. */
  hover(at: HoverTarget, doc: DocumentView<A>): Hover | undefined;
}

/**
 * A facet's own reading and writing of names ({@link LanguageFacet.nameSyntax}): names that
 * escape characters (`"x""y"` for `x"y`) or take quotes only when they need them.
 */
export interface NameSyntax {
  /**
   * Where symbol `s` (a parser occurrence in `text`) writes its name: `range` is the text a
   * rename replaces, and `quote` the opening quote around it when it is written in quotes
   * (the range then lies just inside them, and is one token with them). `undefined` when the
   * text there does not read as the name: the service drops the occurrence, so a rename of
   * its symbol is refused.
   */
  read(
    text: string,
    s: SymbolOccurrence
  ): { readonly range: Range; readonly quote?: string } | undefined;
  /**
   * The edit renaming one occurrence (`at`, as {@link read} gave it) of `text` to `newName`,
   * which `isValidId` has accepted: `newText` in place of `range`, a range that holds
   * `at.range` and may take more (the blanks around a field the new name must be quoted in).
   * With a name syntax the service asks `isValidId` about every rename, quoted or not, and
   * does not refuse a quote character in the name itself: escaping it is this method's job.
   */
  write(
    newName: string,
    at: { readonly range: Range; readonly quote?: string },
    text: string
  ): { range: Range; newText: string };
}

/**
 * What a completion item is (D95, D96). Front matter uses `property` (a key) and `value`;
 * diagram text adds keywords, the user's ids (`node`, `subgraph`, `class`), `constant`s
 * (directions, link targets), `operator`s (arrows, `:::`, `&`) and `shape`s (bracket shapes,
 * shape names). Adapters map each to their editor's item kind.
 */
export type CompletionKind =
  | 'property'
  | 'value'
  | 'keyword'
  | 'node'
  | 'subgraph'
  | 'class'
  | 'constant'
  | 'operator'
  | 'shape';

/** One completion item (D95, D96). Editor-agnostic; adapters map it to their own type. */
export interface CompletionItem {
  /** What the list shows, and what filtering matches against. */
  readonly label: string;
  readonly kind: CompletionKind;
  /** The text that replaces `range`. */
  readonly insertText: string;
  /** The text the item replaces: the word being typed (empty at a fresh position). */
  readonly range: Range;
  /** One short line next to the label (the type, `default`). */
  readonly detail?: string;
  /** Markdown shown for the selected item. */
  readonly documentation?: string;
}

/** Hover contents (D93, D96): markdown for the range it describes. */
export interface Hover {
  readonly range: Range;
  /** Markdown. */
  readonly contents: string;
}
