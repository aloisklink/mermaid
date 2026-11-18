/**
 * Parse output (DESIGN §4.2, R-PARSE-3): every parse returns the model plus the AST,
 * diagnostics, symbol occurrences and statement spans. `ParseState` collects them for one
 * parse.
 */
import { AstIds } from './ast.js';
import type { AstNode } from './ast.js';
import { Diagnostics } from './diagnostics.js';
import type { Diagnostic } from './diagnostics.js';
import type { Range } from './positions.js';
import type { Probe, ProbeResult } from './probe.js';
import type { TokenStream } from './tokens.js';

/** One occurrence of a user identifier: for definition, references and rename (R-PARSE-5). */
export interface SymbolOccurrence {
  name: string;
  /** What the name denotes, e.g. `node`, `class`, `subgraph`. */
  kind: string;
  range: Range;
  role: 'def' | 'ref';
}

/** A statement's source span, for folding and code↔diagram highlighting. */
export interface StatementSpan {
  kind: string;
  range: Range;
  /** Statements inside a block statement (e.g. a subgraph body). */
  children?: StatementSpan[];
}

export interface ParseOptions {
  /** Also return the token stream (`config.internal.keepTokens`; for editors). */
  keepTokens?: boolean;
  /** Record what the parser would accept at this UTF-16 offset (R-LANG-7, D95). */
  probe?: number;
}

/**
 * A diagram embedded in a host diagram (ADR-15): `mermaid <id>["Title"] { … }`. The host lists
 * its blocks; `mermaid` renders each one and hands it back by id (`RenderContext.embed`).
 */
export interface EmbeddedBlock {
  /** The block's node id in the host. */
  readonly id: string;
  /** The title as written inside `["…"]`, unquoted; absent for an untitled block. */
  readonly title?: string;
  /** The body as written: another diagram's whole text. */
  readonly text: string;
  /** Where {@link text} starts in the host's text, to place errors inside it. */
  readonly offset: number;
  /**
   * Folded (`id@{ view: collapsed }`, #670): never parsed, laid out or drawn; `mermaid` detects
   * only its type, from its type line (`RenderContext.foldedType`).
   */
  readonly folded?: boolean;
}

export interface ParseResult<M, A extends AstNode = AstNode> {
  /** Plain, serialisable (structuredClone-able) diagram model. */
  model: M;
  ast: A;
  /** Errors and warnings, ranges in the original source. */
  diagnostics: Diagnostic[];
  symbols: SymbolOccurrence[];
  statements: StatementSpan[];
  /** Only with {@link ParseOptions.keepTokens}. */
  tokens?: TokenStream;
  /** Only with {@link ParseOptions.probe}. */
  probe?: ProbeResult;
  /** The diagrams embedded in this one, in source order (ADR-15); absent when there are none. */
  embeds?: readonly EmbeddedBlock[];
  /**
   * The edges the parse made, for `maxEdges` counted across a text with embedded diagrams
   * (ADR-15); absent for a type that does not count them.
   */
  edgeCount?: number;
}

/** Collects the side outputs of one parse. Create one per parse. */
export class ParseState {
  readonly diagnostics = new Diagnostics();
  readonly symbols: SymbolOccurrence[] = [];
  readonly statements: StatementSpan[] = [];
  readonly ids = new AstIds();
  private readonly open: StatementSpan[] = [];

  /** Record an identifier occurrence. */
  symbol(name: string, kind: string, range: Range, role: 'def' | 'ref'): void {
    this.symbols.push({ name, kind, range, role });
  }

  private place(span: StatementSpan): StatementSpan {
    const parent = this.open[this.open.length - 1];
    if (parent) (parent.children ??= []).push(span);
    else this.statements.push(span);
    return span;
  }

  /** Record a complete statement, inside the innermost open block if any. */
  statement(kind: string, range: Range): StatementSpan {
    return this.place({ kind, range });
  }

  /** Open a block statement at `start`; statements recorded until its end nest under it. */
  beginStatement(kind: string, start: number): StatementSpan {
    const span = this.place({ kind, range: { start, end: start } });
    this.open.push(span);
    return span;
  }

  /** Close `span` (and any block left open inside it) at `end`. */
  endStatement(span: StatementSpan, end: number): void {
    const i = this.open.lastIndexOf(span);
    if (i < 0) return;
    for (const s of this.open.splice(i)) s.range.end = end;
  }

  /**
   * Assemble the {@link ParseResult}; the token stream is included only on request, the probe
   * result when the parse had a probe.
   */
  result<M, A extends AstNode>(
    model: M,
    ast: A,
    tokens: TokenStream,
    options?: ParseOptions,
    probe?: Probe
  ): ParseResult<M, A> {
    const out: ParseResult<M, A> = {
      model,
      ast,
      diagnostics: this.diagnostics.list,
      symbols: this.symbols,
      statements: this.statements,
    };
    if (options?.keepTokens) out.tokens = tokens;
    if (probe) out.probe = probe.result();
    return out;
  }
}
