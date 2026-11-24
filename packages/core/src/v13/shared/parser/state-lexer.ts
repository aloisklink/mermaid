/**
 * The machinery every lexer ported from a v12 jison lexer shares: the text v12 lexed (line
 * breaks as LF, plus the line break v12 appended) with the mapping of its offsets back to the
 * source, the removed spans as trivia, the start-condition stack and the scans most of them
 * use. A diagram's lexer extends {@link StateLexer} and writes its start conditions.
 */
import {
  CR,
  firstHole,
  type Hole,
  isBlank,
  isSpace,
  Kind,
  LF,
  localOffset,
  type Probe,
  SourceOffsets,
  type SourceView,
  TokenWriter,
} from '../../parser-kit/index.js';
import { dropAt } from './drop.js';

/** How one diagram's jison lexer read its text. */
export interface StateLexerOptions {
  /** About how many characters of text one token takes (sizes the token arrays). */
  readonly charsPerToken: number;
  /**
   * `fold`: a CRLF is one LF in the lexed text, which is then shorter than the view's (offsets
   * go through a map). `keep`: the lexed text has the view's length (the lexer's
   * {@link StateLexer.prepare} turns CRs into LFs one for one), and a line break token starts
   * at the CR of its CRLF. `raw`: the view's text as it is, CRs included.
   */
  readonly crlf: 'fold' | 'keep' | 'raw';
  /** A dropped `;` that no token's range took is a `Space` token of its own (else no token). */
  readonly dropSpace: boolean;
}

/** The line ends a regex `.` stops at, once CRs are LFs. */
const DOT_ENDS = ['\n', '\u2028', '\u2029'] as const;

/** ASCII lower case of a character code. */
export const lowerCode = (c: number): number => (c >= 65 && c <= 90 ? c + 32 : c);

/** One lex. Offsets are into {@link text}, v12's text; {@link emit} maps them to the source. */
export abstract class StateLexer {
  /** The text v12 lexed, plus the line break v12 appended. */
  protected readonly text: string;
  /** Length of v12's text without the appended line break. */
  protected readonly len: number;
  protected readonly n: number;
  /** The view's text: CRs as written. */
  protected readonly raw: string;
  /**
   * `at[i]` is the view-text offset of `text[i]` (`at[len]` its end), when a CR made the two
   * differ; else undefined and they are the same.
   */
  protected readonly at: Uint32Array | undefined;
  protected readonly offsets: SourceOffsets | undefined;
  protected readonly holes: readonly Hole[];
  /** The next removed span to write as trivia. */
  protected hole: number;
  /** The end of the last token's source range (dropped `;` before it belong to a token). */
  protected covered = 0;
  protected readonly w: TokenWriter;
  protected readonly stack: number[] = [];
  /** The start condition; 0 is INITIAL. */
  protected state = 0;
  protected p: number;
  private readonly crStart: boolean;
  /** The next line end a regex `.` stops at, cached for {@link dotEnd} (-2: not looked up). */
  private readonly nextEnd = [-2, -2, -2];
  private readonly dropSpace: boolean;

  constructor(
    protected readonly src: string,
    from: number,
    view: SourceView,
    options: StateLexerOptions
  ) {
    this.crStart = options.crlf === 'keep';
    this.dropSpace = options.dropSpace;
    this.offsets = view.runs && new SourceOffsets(view.runs);
    this.holes = view.holes;
    this.hole = firstHole(view, from);
    const start = localOffset(view, from);
    this.raw = view.text;
    let text = this.viewText(view);
    if (options.crlf === 'fold' && text.includes('\r', start)) {
      const at = new Uint32Array(text.length + 1);
      text = this.fold(text, start, at);
      this.at = at.subarray(0, text.length + 1);
    }
    this.len = text.length;
    this.text = this.prepare(text, view) + '\n';
    this.n = this.text.length;
    this.p = start;
    this.w = new TokenWriter((((this.len - this.p) / options.charsPerToken) | 0) + 8);
  }

  /** The text to lex, before line breaks are folded: the view's, unless a lexer rewrites it. */
  protected viewText(view: SourceView): string {
    return view.text;
  }

  /**
   * The lexed text from v12's (same length): placeholders for entities and tag quotes, where
   * the lexer has them. Called from the constructor, after the offset maps are set.
   */
  protected prepare(text: string, _view: SourceView): string {
    return text;
  }

  /**
   * `raw` with every CRLF and lone CR as one LF, as v12 had it, and in `at` where each
   * character came from. A CR and an LF that a removed span left side by side are two line
   * ends: v12 turned CRs into LFs before it removed anything. Offsets before `start` are kept.
   */
  private fold(raw: string, start: number, at: Uint32Array): string {
    const out: string[] = [];
    let k = 0;
    let run = 0;
    for (let q = 0; q < raw.length; q++) {
      at[k++] = q;
      if (raw.charCodeAt(q) !== CR) continue;
      out.push(raw.slice(run, q), '\n');
      run = q + 1;
      if (q >= start && raw.charCodeAt(q + 1) === LF && this.adjacent(q)) {
        q++;
        run = q + 1;
      }
    }
    out.push(raw.slice(run));
    at[k] = raw.length;
    return out.join('');
  }

  /** Whether view-text offsets `q` and `q + 1` are next to each other in the source. */
  protected adjacent(q: number): boolean {
    const o = this.offsets;
    return !o || o.source(q + 1) === o.source(q) + 1;
  }

  /** v12 trimmed leading blanks (after removing comments) before lexing. */
  protected trim(): void {
    const { text } = this;
    while (this.p < this.len && isSpace(text.charCodeAt(this.p))) this.p++;
  }

  /**
   * Step to the end of the text. With a `probe`, each step's source range is reported with the
   * start condition (its name in `names`) it was read in: an opener's text is read in the state
   * before it, a closer's in the one it leaves. Two loops, so a plain lex does no probe work.
   */
  protected loop(probe: Probe | undefined, names: readonly string[]): void {
    const { text, n } = this;
    if (probe === undefined) while (this.p < n) this.step(text.charCodeAt(this.p));
    else {
      while (this.p < n) {
        const before = this.source(this.p);
        const state = this.state;
        this.step(text.charCodeAt(this.p));
        probe.lexed(before, this.source(this.p), names[state] ?? '');
      }
      probe.lexed(this.src.length, this.src.length, names[this.state] ?? '');
    }
  }

  /** One rule match at `p` (`c`, its character) in the current start condition. */
  protected abstract step(c: number): void;

  // --- Offsets and output -------------------------------------------------------------------

  /** View-text offset of `text[i]`. */
  protected view(i: number): number {
    return this.at ? (this.at[i] ?? 0) : i;
  }

  /** Source offset of `text[i]`; the end of the source from the appended line break on. */
  protected source(i: number): number {
    if (i >= this.len) return this.src.length;
    const v = this.at ? (this.at[i] ?? 0) : i;
    return this.offsets ? this.offsets.source(v) : v;
  }

  /** Source offset just past the last source character of `text[i]` (a CRLF's LF). */
  protected sourceEnd(i: number): number {
    const v = (this.at ? (this.at[i + 1] ?? 0) : i + 1) - 1;
    return (this.offsets ? this.offsets.source(v) : v) + 1;
  }

  /**
   * Write the removed spans that start before `at` (a source offset) as trivia. With
   * {@link StateLexerOptions.dropSpace}, a dropped `;` that no token's range took (one after
   * skipped blanks) is a `Space` token of its own.
   */
  protected trivia(at: number): void {
    const hs = this.holes;
    for (let h = hs[this.hole]; h && h.start < at; h = hs[++this.hole]) {
      if (h.kind === 'comment') this.w.push(Kind.Comment, h.start, h.end);
      else if (h.kind === 'directive') this.w.push(Kind.Directive, h.start, h.end);
      else if (this.dropSpace && h.start >= this.covered) this.w.push(Kind.Space, h.start, h.end);
    }
  }

  /**
   * Write the token `text[s, end)` with its source range, and move to `next` (default `end`:
   * an opener may end before the blanks it consumed).
   */
  protected emit(kind: number, s: number, end: number, next: number = end): void {
    let a = this.source(s);
    const last = Math.min(end, this.len);
    let b = last > s ? this.sourceEnd(last - 1) : a;
    // A line break starts at the CR of its CRLF.
    if (this.crStart && b > a) {
      const { src } = this;
      if (src.charCodeAt(a) === LF && src.charCodeAt(a - 1) === CR) a--;
    }
    if (this.holes.length > 0) {
      this.trivia(a);
      if (b > a) b = this.dropAt(b);
    }
    this.w.push(kind, a, b);
    if (b > this.covered) this.covered = b;
    this.p = next;
  }

  /** The end of the `;` v12 dropped at `b`, which belongs to the token before it; else `b`. */
  protected dropAt(b: number): number {
    return dropAt(this.holes, this.hole, b);
  }

  /** Enter `state` (jison `pushState`). */
  protected pushState(state: number): void {
    this.stack.push(this.state);
    this.state = state;
  }

  /** Leave the current state (jison `popState`). */
  protected popState(): void {
    this.state = this.stack.pop() ?? 0;
  }

  /** Write the token `text[p, end)` and enter `state` (jison `begin`). */
  protected begin(kind: number, end: number, state: number): void {
    this.emit(kind, this.p, end);
    this.stack.push(this.state);
    this.state = state;
  }

  /** Write the token `text[p, end)` and leave the current state (jison `popState`). */
  protected pop(kind: number, end: number): void {
    this.emit(kind, this.p, end);
    this.state = this.stack.pop() ?? 0;
  }

  // --- Scans --------------------------------------------------------------------------------

  /** The first LF at or after `q` (jison `[^\n]*` ends there), else the end. */
  protected lineEnd(q: number): number {
    const e = this.text.indexOf('\n', q);
    return e === -1 ? this.n : e;
  }

  /**
   * The first line end a regex `.` stops at (LF, U+2028, U+2029; CRs are LFs by now) at or
   * after `q`, else the end. Found with `indexOf`, keeping the next of each; `q` never
   * decreases between calls, so all calls cost one pass over the text.
   */
  protected dotEnd(q: number): number {
    let min = this.n;
    for (let k = 0; k < 3; k++) {
      let e = this.nextEnd[k] ?? -1;
      if (e !== -1 && e < q) this.nextEnd[k] = e = this.text.indexOf(DOT_ENDS[k] ?? '', q);
      if (e !== -1 && e < min) min = e;
    }
    return min;
  }

  /** The end of the run of `[\t ]` from `q`. */
  protected blanks(q: number): number {
    let j = q;
    while (j < this.n && isBlank(this.text.charCodeAt(j))) j++;
    return j;
  }

  /** The end of the run of `\s` from `q`. */
  protected spaces(q: number): number {
    let j = q;
    while (j < this.n && isSpace(this.text.charCodeAt(j))) j++;
    return j;
  }

  /** Whether the case-insensitive literal `word` (lower case) is at `q`. */
  protected literal(word: string, q: number): boolean {
    if (q + word.length > this.n) return false;
    for (let k = 0; k < word.length; k++) {
      if (lowerCode(this.text.charCodeAt(q + k)) !== word.charCodeAt(k)) return false;
    }
    return true;
  }
}
