/**
 * A read position over a {@link TokenStream} for recursive-descent parsers. It always rests
 * on a significant token: trivia kinds are skipped on every move. One cursor per parse.
 */
import type { Range } from './positions.js';
import type { Probe } from './probe.js';
import { Kind, tokenText } from './tokens.js';
import type { TokenKind, TokenStream } from './tokens.js';

/** Membership table for token kinds: `set[kind] === 1`. Build with {@link kindSet}. */
export type KindSet = Uint8Array;

export function kindSet(...kinds: readonly TokenKind[]): KindSet {
  const set = new Uint8Array(Math.max(0, ...kinds) + 1);
  for (const k of kinds) set[k] = 1;
  return set;
}

export function inKindSet(set: KindSet, kind: TokenKind): boolean {
  return set[kind] === 1;
}

/** Default trivia: comments, directives and kept spaces. Newlines are significant. */
export const TRIVIA: KindSet = /* @__PURE__ */ kindSet(Kind.Comment, Kind.Directive, Kind.Space);

export class TokenCursor {
  /** Index of the current token in {@link tokens}. */
  pos: number;

  constructor(
    readonly tokens: TokenStream,
    private readonly trivia: KindSet = TRIVIA
  ) {
    this.pos = this.skip(0);
  }

  protected skip(i: number): number {
    const last = this.tokens.length - 1;
    while (i < last && this.trivia[this.tokens.kind[i] ?? 0] === 1) i++;
    return Math.min(i, last);
  }

  get kind(): TokenKind {
    return this.tokens.kind[this.pos] ?? Kind.EOF;
  }

  get text(): string {
    return tokenText(this.tokens, this.pos);
  }

  get start(): number {
    return this.tokens.start[this.pos] ?? 0;
  }

  get end(): number {
    return this.tokens.end[this.pos] ?? 0;
  }

  get range(): Range {
    return { start: this.start, end: this.end };
  }

  /** Kind of the significant token after the current one. */
  peek(): TokenKind {
    return this.tokens.kind[this.skip(this.pos + 1)] ?? Kind.EOF;
  }

  /** Move to the next significant token (stays on EOF). Returns the index moved from. */
  next(): number {
    const from = this.pos;
    this.pos = this.skip(from + 1);
    return from;
  }

  /** Whether the significant token after the current one has `kind`. */
  peekAt(kind: TokenKind): boolean {
    return this.peek() === kind;
  }

  at(kind: TokenKind): boolean {
    return this.kind === kind;
  }

  /** Consume the current token if it has `kind`. */
  eat(kind: TokenKind): boolean {
    if (this.kind !== kind) return false;
    this.next();
    return true;
  }

  /**
   * Tell a probe what the parser would accept here without testing each kind, e.g. what may
   * start a statement where a loop stops at the end of the text. Does nothing without one.
   */
  tested(_kinds: TokenKind | readonly TokenKind[]): void {
    // Recorded by ProbeCursor only.
  }

  /** Recovery starts (called by `syncTo`). Does nothing without a probe. */
  recovering(): void {
    // Recorded by ProbeCursor only.
  }
}

/**
 * A {@link TokenCursor} for a probe parse: `at`, `eat`, `peekAt` and `tested` record the kinds
 * tested at the probed token. A plain parse uses `TokenCursor`, which records nothing.
 */
export class ProbeCursor extends TokenCursor {
  /** Index of the probed token in the stream; -1 when there is none. */
  private readonly target: number;

  constructor(
    tokens: TokenStream,
    private readonly probe: Probe,
    trivia: KindSet = TRIVIA
  ) {
    super(tokens, trivia);
    probe.trivia(tokens);
    this.target = probe.targetIn(tokens, 0, trivia);
  }

  private record(at: number, kinds: TokenKind | readonly TokenKind[]): void {
    if (at === this.target) this.probe.tested(kinds, this.tokens.start[at] ?? 0);
  }

  override peekAt(kind: TokenKind): boolean {
    this.record(this.skip(this.pos + 1), kind);
    return super.peekAt(kind);
  }

  override at(kind: TokenKind): boolean {
    this.record(this.pos, kind);
    return super.at(kind);
  }

  override eat(kind: TokenKind): boolean {
    this.record(this.pos, kind);
    return super.eat(kind);
  }

  override tested(kinds: TokenKind | readonly TokenKind[]): void {
    this.record(this.pos, kinds);
  }

  override recovering(): void {
    this.probe.freeze();
  }
}
