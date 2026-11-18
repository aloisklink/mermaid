/**
 * Token-level rules of the sequence parser: token access, the probe hook, error reports with
 * human names (R-ERR-2, R-ERR-5) and statement recovery (R-PARSE-4). The grammar rules are in
 * `parser.ts`, which extends this class.
 */
import { cook, inKindSet, Kind, LineIndex, skipTo } from '@mermaid-js/core/v13/parser-kit/index.js';
import type {
  ParseState,
  Probe,
  Range,
  SourceView,
  TokenView,
} from '@mermaid-js/core/v13/parser-kit/index.js';
import { BOUNDARY, EXPECTED, LINE_END, NEWLINE, STOP } from './tables.js';
import { T } from './tokens.js';

/**
 * One parse's token position and error handling. A rule that fails records a diagnostic and
 * throws {@link STOP}; the statement loop catches it and calls {@link recover}.
 */
export abstract class TokenRules {
  /** Index into {@link tokens}. */
  protected i = 0;
  /** Line numbers, built for error messages only. */
  private lines: LineIndex | undefined;
  /** How the current statement is written, for errors inside it. */
  protected hint: string | undefined;

  constructor(
    protected readonly src: string,
    protected readonly view: SourceView,
    protected readonly st: ParseState,
    protected readonly tokens: TokenView,
    /** Probe mode only (R-LANG-7). */
    protected readonly probe: Probe | undefined
  ) {}

  // ---- tokens -------------------------------------------------------------------------

  protected kind(j = this.i): number {
    return this.tokens.kind[j] ?? Kind.EOF;
  }

  protected start(j: number): number {
    return this.tokens.start[j] ?? 0;
  }

  protected end(j: number): number {
    return this.tokens.end[j] ?? 0;
  }

  /** A token's text as v12 saw it (removed spans dropped, entities decoded). */
  protected raw(j = this.i): string {
    return cook(this.src, this.start(j), this.end(j), this.view);
  }

  /**
   * Probe hook: the parser tests the current token for `kinds` (a constant list), or would
   * accept them there. Records them when it is the probed token.
   */
  protected tested(kinds: readonly number[]): void {
    const p = this.probe;
    if (p?.isAt(this.tokens, this.i)) p.tested(kinds, this.start(this.i));
  }

  protected range(a: number, b = a): Range {
    return { start: this.start(a), end: this.end(b) };
  }

  /** From token `from` to the last one consumed. */
  protected span(from: number): Range {
    const start = this.start(from);
    return { start, end: this.i > from ? this.end(this.i - 1) : start };
  }

  // ---- errors and recovery ------------------------------------------------------------

  protected lineOf(at: number): number {
    return (this.lines ??= new LineIndex(this.src)).position(at).line + 1;
  }

  /** How an error message names the token at `j`. */
  protected found(j = this.i): string {
    const k = this.kind(j);
    if (k === Kind.EOF || k === T.Eof) return 'the end of the text';
    if (k === Kind.Newline || k === T.AliasEnd) return 'a line break';
    if (k === Kind.Error && this.start(j) === this.end(j)) {
      return this.start(j) >= this.src.length ? 'the end of the text' : 'a line break';
    }
    const t = this.raw(j).trim();
    if (t === '') return k === T.Semi ? '`;`' : 'nothing';
    return t.length > 24 ? `\`${t.slice(0, 24)}…\`` : `\`${t}\``;
  }

  /** Report what was found where one of `want` was expected, then stop the statement. */
  protected fail(want: readonly number[], hint = this.hint): never {
    this.tested(want);
    const { st } = this;
    const k = this.kind();
    const where = this.range(this.i);
    if (k === Kind.Error && where.end > where.start) {
      st.diagnostics.error(
        'UNEXPECTED_CHARACTER',
        `Unexpected character \`${this.raw()}\`${hint ? `; ${hint}` : ''}.`,
        where,
        { expected: EXPECTED.names(want) }
      );
      throw STOP;
    }
    st.diagnostics.unexpected(
      'UNEXPECTED',
      where,
      EXPECTED.names(want),
      this.found(),
      undefined,
      this.explain() ?? hint
    );
    throw STOP;
  }

  /** A fix for the unexpected token, from what it is. */
  protected explain(): string | undefined {
    if (this.kind() === T.Invalid && /[<>]/.test(this.raw())) {
      return 'a participant id cannot hold `<` or `>`: write the label with `as`, e.g. `participant A as <label>`';
    }
    return undefined;
  }

  /** Skip to the next statement boundary after an error (R-PARSE-4). */
  protected recover(): void {
    this.probe?.freeze();
    this.i = skipTo(this.tokens, this.i, BOUNDARY);
  }

  // ---- token rules --------------------------------------------------------------------

  protected expect(want: readonly number[]): number {
    this.tested(want);
    if (!want.includes(this.kind())) this.fail(want);
    return this.i++;
  }

  /** jison's `NEWLINE` after a statement. */
  protected separator(): void {
    this.tested(LINE_END);
    if (!inKindSet(NEWLINE, this.kind())) this.fail(LINE_END);
    this.i++;
  }
}
