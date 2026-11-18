/**
 * Token kinds shared by every diagram lexer. Kinds are plain numbers; a diagram declares
 * its own kinds as an `as const` object starting at {@link FIRST_DIAGRAM_KIND}
 * (TS enums are banned by lint).
 *
 * ```ts
 * const T = { Id: FIRST_DIAGRAM_KIND, Arrow: FIRST_DIAGRAM_KIND + 1 } as const;
 * ```
 */
export const Kind = {
  /** End of input. Every stream ends with exactly one, zero-width at `source.length`. */
  EOF: 0,
  /** A line break: `\n`, `\r\n` or `\r` (one token, the source is never normalised). */
  Newline: 1,
  /** `%% …` comment. Trivia: lexers emit it, parsers skip it. */
  Comment: 2,
  /** `%%{ … }%%` directive, left in place and skipped as trivia. */
  Directive: 3,
  /** Blanks between tokens, when a lexer chooses to keep them. Trivia. */
  Space: 4,
  /** Input the lexer could not match. The parser reports it. */
  Error: 5,
} as const;

/** Numeric token kind: a value of {@link Kind} or a diagram's own kind object. */
export type TokenKind = number;

/** First kind number a diagram may use; 0–15 are reserved for {@link Kind}. */
export const FIRST_DIAGRAM_KIND = 16;

/**
 * Tokens as parallel arrays: token `i` is `kind[i]`, source `[start[i], end[i])`, `text[i]`.
 * There are no token objects. Offsets are into the original source.
 */
export interface TokenStream {
  readonly kind: Uint16Array;
  readonly start: Uint32Array;
  readonly end: Uint32Array;
  /** The text the offsets point into; a token's text is {@link tokenText}. */
  readonly source: string;
  /** Number of tokens, including the final EOF. */
  readonly length: number;
}

/** A token's text: `source.slice(start, end)`. Computed on demand, so lexing slices nothing. */
export function tokenText(tokens: TokenStream, i: number): string {
  return tokens.source.slice(tokens.start[i] ?? 0, tokens.end[i] ?? 0);
}

/** Append-only builder for a {@link TokenStream}; create one per lex. */
export class TokenWriter {
  private kind: Uint16Array;
  private start: Uint32Array;
  private end: Uint32Array;
  private n = 0;

  /** `capacity` is a guess at the token count; the arrays grow past it. */
  constructor(capacity = 16) {
    const size = Math.max(4, capacity | 0);
    this.kind = new Uint16Array(size);
    this.start = new Uint32Array(size);
    this.end = new Uint32Array(size);
  }

  push(kind: TokenKind, start: number, end: number): void {
    if (this.n === this.kind.length) this.grow();
    this.kind[this.n] = kind;
    this.start[this.n] = start;
    this.end[this.n] = end;
    this.n++;
  }

  /** Append the EOF token at `source.length` and return the finished stream. */
  finish(source: string): TokenStream {
    this.push(Kind.EOF, source.length, source.length);
    const n = this.n;
    return {
      // Copies: a view of a small on-heap array moves its buffer off the heap, which costs more.
      kind: this.kind.slice(0, n),
      start: this.start.slice(0, n),
      end: this.end.slice(0, n),
      source,
      length: n,
    };
  }

  private grow(): void {
    const size = this.kind.length * 2;
    const kind = new Uint16Array(size);
    kind.set(this.kind);
    this.kind = kind;
    const start = new Uint32Array(size);
    start.set(this.start);
    this.start = start;
    const end = new Uint32Array(size);
    end.set(this.end);
    this.end = end;
  }
}
