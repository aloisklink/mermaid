/**
 * Test-only adapter for the ported v12 sequence specs (R-TEST-3): v12's `Diagram.fromText`,
 * `mermaidAPI.parse` and the `SequenceDB` getters, backed by the v13 sequence parse. The
 * specs' expectations are kept as v12 wrote them; this file only translates names and
 * rebuilds v12's flat message list from the model's statement tree.
 */
import { preprocess } from '@mermaid-js/core/v13/preprocess/index.js';
import type { SequenceModel, SequenceStatement } from '../index.js';
import { parseSequence } from '../parser/index.js';
import type { SequenceParseResult } from '../parser/index.js';

export const LINETYPE = {
  SOLID: 0,
  DOTTED: 1,
  NOTE: 2,
  SOLID_CROSS: 3,
  DOTTED_CROSS: 4,
  SOLID_OPEN: 5,
  DOTTED_OPEN: 6,
  LOOP_START: 10,
  LOOP_END: 11,
  ALT_START: 12,
  ALT_ELSE: 13,
  ALT_END: 14,
  OPT_START: 15,
  OPT_END: 16,
  ACTIVE_START: 17,
  ACTIVE_END: 18,
  PAR_START: 19,
  PAR_AND: 20,
  PAR_END: 21,
  RECT_START: 22,
  RECT_END: 23,
  SOLID_POINT: 24,
  DOTTED_POINT: 25,
  AUTONUMBER: 26,
  CRITICAL_START: 27,
  CRITICAL_OPTION: 28,
  CRITICAL_END: 29,
  BREAK_START: 30,
  BREAK_END: 31,
  PAR_OVER_START: 32,
  BIDIRECTIONAL_SOLID: 33,
  BIDIRECTIONAL_DOTTED: 34,
  SOLID_TOP: 41,
  SOLID_BOTTOM: 42,
  STICK_TOP: 43,
  STICK_BOTTOM: 44,
  SOLID_ARROW_TOP_REVERSE: 45,
  SOLID_ARROW_BOTTOM_REVERSE: 46,
  STICK_ARROW_TOP_REVERSE: 47,
  STICK_ARROW_BOTTOM_REVERSE: 48,
  SOLID_TOP_DOTTED: 51,
  SOLID_BOTTOM_DOTTED: 52,
  STICK_TOP_DOTTED: 53,
  STICK_BOTTOM_DOTTED: 54,
  SOLID_ARROW_TOP_REVERSE_DOTTED: 55,
  SOLID_ARROW_BOTTOM_REVERSE_DOTTED: 56,
  STICK_ARROW_TOP_REVERSE_DOTTED: 57,
  STICK_ARROW_BOTTOM_REVERSE_DOTTED: 58,
  CENTRAL_CONNECTION: 59,
  CENTRAL_CONNECTION_REVERSE: 60,
  CENTRAL_CONNECTION_DUAL: 61,
} as const;
export const PLACEMENT = { LEFTOF: 0, RIGHTOF: 1, OVER: 2 } as const;

const START: Record<string, number> = {
  loop: 10,
  alt: 12,
  opt: 15,
  par: 19,
  par_over: 32,
  critical: 27,
  break: 30,
};
const SECTION: Record<string, number> = { alt: 13, par: 20, par_over: 20, critical: 28 };
const END: Record<string, number> = {
  loop: 11,
  alt: 14,
  opt: 16,
  par: 21,
  par_over: 21,
  critical: 29,
  break: 31,
};
const CENTRAL: Record<string, number> = { to: 59, from: 60, both: 61 };
const PLACEMENTS = { left: 0, right: 1, over: 2 } as const;

type Message = Record<string, unknown>;

/** v12's `config.wrap ?? config.sequence.wrap`, from the front matter and directives. */
function wrapDefault(text: string): boolean {
  const pre = preprocess(text);
  let wrap: unknown;
  const take = (c: unknown) => {
    if (!c || typeof c !== 'object') return;
    const o = c as { wrap?: unknown; sequence?: { wrap?: unknown } };
    if (o.sequence?.wrap !== undefined) wrap = o.sequence.wrap;
    if (o.wrap !== undefined) wrap = o.wrap;
  };
  take(pre.frontMatter?.config);
  for (const d of pre.directives) {
    if (d.kind === 'wrap') wrap = true;
    else if (d.kind === 'init') take(d.args);
  }
  return wrap === true;
}

/** Rebuild v12's message list (DB `messages`) from the statement tree. */
function rebuild(
  statements: readonly SequenceStatement[],
  byDefault: boolean,
  out: Message[],
  at: Map<string, number>
): void {
  const push = (m: Message) => out.push({ id: String(out.length), ...m });
  const signal = (type: number, from?: string, extra: Message = {}) =>
    push({
      from,
      to: undefined,
      message: '',
      wrap: byDefault,
      type,
      activate: false,
      centralConnection: 0,
      ...extra,
    });
  for (const s of statements) {
    if (s.kind === 'message') {
      at.set(s.ast, out.length);
      push({
        from: s.from,
        to: s.to,
        message: s.text,
        wrap: s.wrap ?? byDefault,
        type: LINETYPE[s.arrow.toUpperCase() as keyof typeof LINETYPE],
        activate: s.activation === 'activate' || s.central === 'to' || s.central === 'both',
        centralConnection: s.central ? (CENTRAL[s.central] ?? 0) : 0,
      });
      if (s.activation === 'activate') signal(17, s.to);
      if (s.activation === 'deactivate') signal(18, s.from);
      if (s.central === 'to' || s.central === 'both') signal(59, s.to);
      if (s.central === 'from' || s.central === 'both') signal(60, s.from);
    } else if (s.kind === 'note') {
      push({
        from: s.participants[0],
        to: s.participants[1] ?? s.participants[0],
        message: s.text,
        wrap: s.wrap ?? byDefault,
        type: 2,
        placement: PLACEMENTS[s.placement],
      });
    } else if (s.kind === 'activation') signal(s.active ? 17 : 18, s.participant);
    else if (s.kind === 'autonumber') {
      push({
        from: undefined,
        to: undefined,
        message: { start: s.start, step: s.step, visible: s.visible },
        wrap: false,
        type: 26,
      });
    } else if (s.kind === 'rect') {
      signal(22, undefined, { message: s.color });
      rebuild(s.statements, byDefault, out, at);
      signal(23);
    } else {
      s.sections.forEach((section, i) => {
        const type = (i === 0 ? START : SECTION)[s.fragment] ?? -1;
        signal(type, undefined, { message: section.label, wrap: section.wrap ?? byDefault });
        rebuild(section.statements, byDefault, out, at);
      });
      signal(END[s.fragment] ?? -1);
    }
  }
}

/** A v12 `SequenceDB` read-out of one parse. */
export class SequenceDB {
  readonly LINETYPE = LINETYPE;
  readonly PLACEMENT = PLACEMENT;
  private model: SequenceModel | undefined;
  private byDefault = false;
  private title = '';

  clear(): void {
    this.model = undefined;
    this.built = undefined;
  }

  load(result: SequenceParseResult, text: string): void {
    this.model = result.model;
    this.built = undefined;
    this.byDefault = wrapDefault(text);
    const pre = preprocess(text);
    this.title = result.model.title ?? pre.frontMatter?.title ?? '';
  }

  private get m(): SequenceModel {
    return (
      this.model ?? {
        participants: [],
        boxes: [],
        statements: [],
        accTitle: '',
        accDescr: '',
        warnings: [],
      }
    );
  }

  private built: { messages: Message[]; at: Map<string, number> } | undefined;

  private rows(): { messages: Message[]; at: Map<string, number> } {
    if (!this.built) {
      const messages: Message[] = [];
      const at = new Map<string, number>();
      rebuild(this.m.statements, this.byDefault, messages, at);
      this.built = { messages, at };
    }
    return this.built;
  }

  getMessages(): Message[] {
    return this.rows().messages;
  }

  getBoxes(): Message[] {
    const actors = this.getActors();
    return this.m.boxes.map((b) => ({
      name: b.label || undefined,
      fill: b.color ?? 'transparent',
      wrap: b.wrap ?? this.byDefault,
      actorKeys: [...b.participants],
      get actors() {
        return actors;
      },
    }));
  }

  getActors(): Map<string, Message> {
    const boxes = this.m.boxes.map((b) => ({
      name: b.label || undefined,
      fill: b.color ?? 'transparent',
      wrap: b.wrap ?? this.byDefault,
      actorKeys: [...b.participants],
    }));
    const actors = new Map<string, Message>();
    for (const p of this.m.participants) {
      actors.set(p.id, {
        name: p.id,
        description: p.label,
        type: p.kind,
        wrap: p.wrap ?? this.byDefault,
        box: p.box === undefined ? undefined : boxes[p.box],
        links: { ...p.links },
        properties: { ...p.properties },
      });
    }
    return actors;
  }

  getActor(id: string): Message | undefined {
    return this.getActors().get(id);
  }

  getActorKeys(): string[] {
    return this.m.participants.map((p) => p.id);
  }

  getCreatedActors(): Map<string, number> {
    const { at } = this.rows();
    const out = new Map<string, number>();
    for (const p of this.m.participants) {
      if (p.createdBy !== undefined) out.set(p.id, at.get(p.createdBy) ?? -1);
    }
    return out;
  }

  getDestroyedActors(): Map<string, number> {
    const { at } = this.rows();
    const out = new Map<string, number>();
    for (const p of this.m.participants) {
      if (p.destroyedBy !== undefined) out.set(p.id, at.get(p.destroyedBy) ?? -1);
    }
    return out;
  }

  /**
   * v12's renderer turned sequence numbers on or off at each `autonumber` row as it drew, so
   * after a draw this is the last row's `visible` (false when there is none).
   */
  showSequenceNumbers(): boolean {
    let on = false;
    for (const m of this.getMessages()) {
      if (m.type === LINETYPE.AUTONUMBER) on = (m.message as { visible: boolean }).visible;
    }
    return on;
  }

  getDiagramTitle(): string {
    return this.title;
  }

  getAccTitle(): string {
    return this.m.accTitle;
  }

  getAccDescription(): string {
    return this.m.accDescr;
  }

  getConfig(): Record<string, unknown> {
    return { wrap: this.byDefault };
  }
}

/** Parse `text` into `db` the way v12's pipeline did, or throw the first error. */
function load(text: string, db: SequenceDB): void {
  const result = parseSequence(text);
  const error = result.diagnostics.find((d) => d.severity === 'error');
  if (error) throw new Error(error.message);
  db.load(result, text);
}

/**
 * No drawing here: specs that assert v12's internal `bounds` (which only v12's renderer fills)
 * are skipped; the ones that only call `draw` to see that nothing throws check the parse.
 */
const renderer = { draw: (): Promise<void> => Promise.resolve() };

/** v12 `Diagram.fromText`: `diagram.db` is the read-out. */
export const Diagram = {
  fromText(text: string): Promise<{ db: SequenceDB; renderer: typeof renderer }> {
    const db = new SequenceDB();
    try {
      load(text, db);
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
    return Promise.resolve({ db, renderer });
  },
};

export const mermaidAPI = {
  async parse(text: string): Promise<boolean> {
    await Diagram.fromText(text);
    return true;
  },
};

/** The jison parser object `keywordActors.spec.ts` drives directly. */
export const parser = {
  yy: new SequenceDB(),
  parse(text: string): void {
    load(text, parser.yy);
  },
};

/** v12 `setSiteConfig`; only the skipped renderer specs set config. */
export function setSiteConfig(config: Record<string, unknown>): Record<string, unknown> {
  return config;
}
