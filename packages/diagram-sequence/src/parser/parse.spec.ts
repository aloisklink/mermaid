/**
 * The sequence parser through its public entry: model values as v12 converted them, semantic
 * AST ids, symbols, statement spans and warnings. Oracle parity over the corpus is in
 * `packages/conformance` (`sequence/v13.ts`); these pin the conversions by example.
 */
import { describe, expect, it } from 'vitest';
import type { SequenceStatement } from '../model.js';
import type { SequenceMenuStmt, SequenceStatementNode } from './ast.js';
import { parseSequence } from './index.js';

const parse = (body: string) => {
  const r = parseSequence(`sequenceDiagram\n${body}`);
  expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return r;
};
const first = (body: string): SequenceStatement => {
  const s = parse(body).model.statements[0];
  if (!s) throw new Error('no statement');
  return s;
};

describe('value conversion (as v12)', () => {
  it('keeps entity codes and <br> as written, decoded to HTML entities', () => {
    expect(first('A->>B: a #59; b #9829; c<br>d')).toMatchObject({
      text: 'a &#59; b &#9829; c<br>d',
    });
    expect(first('Note over A: #quot;x#quot;')).toMatchObject({ text: '&quot;x&quot;' });
  });

  it('reads wrap: and nowrap: prefixes, and leaves wrap open otherwise', () => {
    expect(first('A->>B:wrap: x')).toMatchObject({ text: 'x', wrap: true });
    expect(first('A->>B: nowrap:  x ')).toMatchObject({ text: 'x', wrap: false });
    expect(first('A->>B: x')).not.toHaveProperty('wrap');
    expect(first('loop :wrap: every minute\nend')).toMatchObject({
      sections: [{ label: 'every minute', wrap: true }],
    });
  });

  it('takes the alias from `as`, then from `@{ alias }`, as v12 did', () => {
    const m = parse(
      [
        'participant A as Alice',
        'participant B@{ "alias": "Bob" }',
        'participant C@{ alias: Cee } as Carol',
        'participant D@{ alias: Dee } as D',
        'participant A',
      ].join('\n')
    ).model;
    expect(m.participants.map((p) => [p.id, p.label])).toEqual([
      ['A', 'Alice'],
      ['B', 'Bob'],
      ['C', 'Carol'],
      ['D', 'Dee'],
    ]);
  });

  it('orders participants by first mention, declarations included', () => {
    const m = parse('B->>C: x\nparticipant A\nnote over D: n\nparticipant B as Bee').model;
    expect(m.participants.map((p) => [p.id, p.label])).toEqual([
      ['B', 'Bee'],
      ['C', 'C'],
      ['A', 'A'],
      ['D', 'D'],
    ]);
  });

  it('reads participant types from `actor` and `@{ type }`', () => {
    const m = parse(
      'actor A\nparticipant B@{ "type": "database" }\nparticipant C@{ type: queue }'
    ).model;
    expect(m.participants.map((p) => p.kind)).toEqual(['actor', 'database', 'queue']);
  });

  it('writes autonumber N as start N, step 1', () => {
    const m = parse('autonumber 10\nautonumber 3 2\nautonumber off\nautonumber').model;
    expect(
      m.statements.map((s) => s.kind === 'autonumber' && [s.start, s.step, s.visible])
    ).toEqual([
      [10, 1, true],
      [3, 2, true],
      [undefined, undefined, false],
      [undefined, undefined, true],
    ]);
  });

  it('reads box colours and titles as v12 did', () => {
    const m = parse(
      [
        'box Aqua Group A',
        'participant A',
        'end',
        'box rgb(1, 2, 3) wrap:G',
        'participant B',
        'end',
        'box Not a colour',
        'participant C',
        'end',
      ].join('\n')
    ).model;
    expect(m.boxes.map((b) => [b.label, b.color, b.wrap, b.participants])).toEqual([
      ['Group A', 'Aqua', undefined, ['A']],
      ['G', 'rgb(1, 2, 3)', true, ['B']],
      ['Not a colour', undefined, undefined, ['C']],
    ]);
    expect(m.participants.map((p) => p.box)).toEqual([0, 1, 2]);
  });

  it('keeps titles and accessibility text as v12 trimmed them', () => {
    const m = parse('title My title \naccTitle:  T \naccDescr {\n  a\n   b\n}').model;
    expect([m.title, m.accTitle, m.accDescr]).toEqual(['My title ', 'T', 'a\nb']);
  });

  it('marks activations, central connections and create/destroy messages', () => {
    const m = parse(
      'A->>+B: a\nB-->>-A: b\nA()->>()B: c\ncreate participant C\nA->>C: d\ndestroy C\nC->>A: e'
    ).model;
    expect(
      m.statements.map((s) => s.kind === 'message' && [s.ast, s.activation, s.central])
    ).toEqual([
      ['m:A>B', 'activate', undefined],
      ['m:B>A', 'deactivate', undefined],
      ['m:A>B#2', undefined, 'both'],
      ['m:A>C', undefined, undefined],
      ['m:C>A', undefined, undefined],
    ]);
    expect(m.participants.find((p) => p.id === 'C')).toMatchObject({
      createAst: 'p:C',
      createdBy: 'm:A>C',
      destroyAst: 'st:1',
      destroyedBy: 'm:C>A',
    });
  });
});

describe('actor menus on the model (as v12 merged them)', () => {
  it('keeps JSON values, merges arrays by index and resets on a redeclaration', () => {
    const m = parse(
      'links A: {"n": 3}\nproperties A: [1]\nlinks B: {"x": "u"}\nparticipant B as Bee\nlink C: L @ u'
    ).model;
    expect(m.participants.map((p) => [p.id, p.links, p.properties])).toEqual([
      ['A', { n: 3 }, { 0: 1 }],
      ['B', undefined, undefined],
      ['C', { L: 'u' }, undefined],
    ]);
  });

  it('drops the earlier menus from the AST on a redeclaration, as the model drops them', () => {
    const r = parse(
      'participant A\nlinks A: {"Old": "https://example.com/old"}\ndetails A: el\nlinks B: {"b": "u"}\nparticipant A as Alice\nproperties A: {"class": "k"}'
    );
    const menus = r.ast.children.flatMap((n) => ('menu' in n && n.menu ? [n.menu] : []));
    expect(menus).toEqual([
      { target: 'B', links: { b: 'u' } },
      { target: 'A', properties: { class: 'k' } },
    ]);
    expect(r.model.participants[0]).toMatchObject({ id: 'A', properties: { class: 'k' } });
    expect(r.model.participants[0]?.links).toBeUndefined();
  });
});

describe('box colours (as a browser reads them)', () => {
  it('takes CSS system colours and modern syntax, and rejects legacy hsl without %', () => {
    const m = parse(
      'box Background Jobs\nend\nbox hsl(none 0% 0%) A\nend\nbox hsl(1,2,3) B\nend\nbox rgb(1 2 3 / 50%) C\nend'
    ).model;
    expect(m.boxes.map((b) => [b.color, b.label])).toEqual([
      ['Background', 'Jobs'],
      ['hsl(none 0% 0%)', 'A'],
      [undefined, 'hsl(1,2,3) B'],
      ['rgb(1 2 3 / 50%)', 'C'],
    ]);
  });
});

describe('AST, symbols and statements', () => {
  it('keeps p:<id> for the statement that adds the participant', () => {
    for (const body of ['activate A\nA->>B: x\ndeactivate A', 'destroy A\nA->>B: x']) {
      const r = parse(body);
      const a = r.model.participants.find((p) => p.id === 'A');
      expect(a?.ast).toBe('p:A');
      const msg = r.ast.children.find((n) => n.type === 'Message');
      expect(msg && 'children' in msg && msg.children[0]?.id).toBe('p:A');
      const def = r.symbols.find((s) => s.name === 'A' && s.role === 'def');
      expect(def && r.ast.children.find((n) => n.type === 'Message')?.range.start).toBe(
        def?.range.start
      );
    }
  });

  it('gives semantic ids from the names', () => {
    const r = parse(
      'participant A\nA->>B: x\nA->>B: y\nNote over A: n\nloop l\nB->>A: z\nend\nalt a\nelse b\nend\nbox G\nactor C\nend\nactivate A'
    );
    const ids: string[] = [];
    const walk = (nodes: readonly SequenceStatementNode[] | undefined) => {
      for (const n of nodes ?? []) {
        ids.push(n.id);
        if ('children' in n) walk(n.children as SequenceStatementNode[]);
      }
    };
    walk(r.ast.children);
    expect(ids).toEqual([
      'header:1',
      'p:A',
      'm:A>B',
      'p:A@2',
      'p:B',
      'm:A>B#2',
      'p:A@3',
      'p:B@2',
      'note:1',
      'p:A@4',
      'f:loop#1',
      'm:B>A',
      'p:B@3',
      'p:A@5',
      'f:alt#1',
      'st:1',
      'box:1',
      'p:C',
      'st:2',
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('records participant names as symbols, the first mention as the definition', () => {
    const src = 'sequenceDiagram\nA->>B: x\nparticipant A as Alice';
    const r = parseSequence(src);
    expect(r.symbols.map((s) => [s.name, s.role, src.slice(s.range.start, s.range.end)])).toEqual([
      ['A', 'def', 'A'],
      ['B', 'def', 'B'],
      ['A', 'ref', 'A'],
    ]);
  });

  it('nests statement spans in blocks, from the keyword to `end`', () => {
    const src = 'sequenceDiagram\nalt a\nA->>B: x\nelse b\nB->>A: y\nend';
    const r = parseSequence(src);
    const alt = r.statements.find((s) => s.kind === 'alt');
    expect(alt && src.slice(alt.range.start, alt.range.end)).toBe(src.slice(16));
    expect(alt?.children?.map((c) => c.kind)).toEqual(['message', 'else']);
    expect(alt?.children?.[1]?.children?.map((c) => c.kind)).toEqual(['message']);
  });

  it('carries actor menu data on the AST (D105)', () => {
    const r = parse(
      'links A: {"Repo": "https://r"}\nlink A: Docs @ https://d\nproperties A: {"k": 1}\ndetails A: el-1'
    );
    const menus = r.ast.children.filter((n): n is SequenceMenuStmt => 'participant' in n);
    expect(menus.map((m) => [m.type, m.links, m.properties, m.text])).toEqual([
      ['Links', { Repo: 'https://r' }, undefined, '{"Repo": "https://r"}'],
      ['Link', { Docs: 'https://d' }, undefined, 'Docs @ https://d'],
      ['Properties', undefined, { k: 1 }, '{"k": 1}'],
      ['Details', undefined, undefined, 'el-1'],
    ]);
  });
});

describe('warnings', () => {
  const codes = (body: string) =>
    parseSequence(`sequenceDiagram\n${body}`).diagnostics.map((d) => [d.severity, d.code]);

  // Math is core's label layout's (D176): the render warns MATH_NOT_RENDERED, not the parse.
  it('keeps math as written, with no parse warning', () => {
    expect(codes('A->>B: $$x^2$$')).toEqual([]);
    expect(first('A->>B: $$x^2$$')).toMatchObject({ text: '$$x^2$$' });
    expect(
      codes(
        'participant A as $$\\alpha$$\nloop $$x$$\nA->>B: hi\nend\nalt a\nelse $$y$$\nend\nbox $$z$$\nend'
      )
    ).toEqual([]);
  });

  it('warns about a message after the destroying one (v12 accepts it)', () => {
    expect(codes('A->>B: x\ndestroy B\nA->>B: y\nA->>B: z')).toEqual([
      ['warning', 'SEQUENCE_AFTER_DESTROY'],
    ]);
  });

  it('warns about an unknown participant type and a menu that is not JSON', () => {
    expect(codes('participant A@{ type: robot }\nlinks A: nope')).toEqual([
      ['warning', 'SEQUENCE_PARTICIPANT_TYPE'],
      ['warning', 'SEQUENCE_MENU_DATA'],
    ]);
  });
});
