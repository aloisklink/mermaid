/**
 * A test diagram registered as `sequence` (so `sequence.forceMenus` applies), for the unit and
 * DOM e2e specs. It draws each participant as #143 does: `g.participant[data-id]` holding a
 * lifeline and the top and bottom symbols, each a `g[data-id]` with a label. Its text is lines:
 *
 * - `menuDiagram` (the header), then `participants A B …` (default `P Q`)
 * - `menu <json>`: a statement whose AST node has `menu: <json>`, as sequence's parser emits
 *   for `link`/`links`/`properties`/`details` (the value is not checked, to test bad shapes)
 *
 * Menus never reach the drawing: the svg depends on the participants only.
 */
import type {
  DiagramDefinitionV13,
  ExternalDiagramDefinitionV13,
} from '@mermaid-js/core/diagram-api/types.js';
import type { AstNode, ParseResult } from '@mermaid-js/core/v13/parser-kit/index.js';
import type { SvgWriter } from '@mermaid-js/core/v13/svg/index.js';

export const menuDiagram = {
  id: 'sequence',
  layoutKind: 'custom' as const,
  detector: (t: string): boolean => t.trimStart().startsWith('menuDiagram'),
  parse(text: string): ParseResult<string[], AstNode> {
    let participants = ['P', 'Q'];
    const children: AstNode[] = [];
    for (const line of text.split('\n').map((l) => l.trim())) {
      if (line.startsWith('participants ')) participants = line.split(/\s+/).slice(1);
      else if (line.startsWith('menu '))
        children.push({
          id: `st:${children.length + 1}`,
          type: 'Link',
          range: { start: 0, end: 0 },
          menu: JSON.parse(line.slice(5)) as unknown,
        } as AstNode);
    }
    return {
      model: participants,
      ast: { id: 'doc', type: 'Document', range: { start: 0, end: text.length }, children },
      diagnostics: [],
      symbols: [],
      statements: [],
    };
  },
  render(participants: string[], _l: unknown, _c: unknown, w: SvgWriter): void {
    const width = 120 * participants.length;
    w.open('svg', {
      class: 'mermaid mermaid-sequence',
      viewBox: [0, 0, width, 200],
      width: '100%',
    });
    participants.forEach((id, i) => {
      const x = 10 + 120 * i;
      w.open('g', { class: 'participant', 'data-id': id, 'data-ast': `p:${id}` });
      w.leaf('line', {
        class: 'actor-line',
        'data-id': id,
        x1: x + 50,
        y1: 40,
        x2: x + 50,
        y2: 160,
      });
      for (const [position, y] of [
        ['top', 0],
        ['bottom', 160],
      ] as const) {
        w.open('g', { class: `actor-${position}`, 'data-id': id });
        w.leaf('rect', { x, y, width: 100, height: 40 });
        w.open('text', { class: 'actor', 'data-id': id, x: x + 50, y: y + 25 });
        w.text(id);
        w.close();
        w.close();
      }
      w.close();
    });
    w.close();
  },
};

/** `menuDiagram` text: the participants, then one `menu` line per value. */
export function menuText(menus: readonly unknown[], participants = ['P', 'Q']): string {
  return [
    'menuDiagram',
    `participants ${participants.join(' ')}`,
    ...menus.map((m) => `menu ${JSON.stringify(m)}`),
    '',
  ].join('\n');
}

/** `menuDiagram` as an external diagram, for `registerExternalDiagrams`. */
export const menuDefinition: ExternalDiagramDefinitionV13 = {
  id: menuDiagram.id,
  detector: menuDiagram.detector,
  loader: () =>
    Promise.resolve({
      id: menuDiagram.id,
      diagram: menuDiagram as unknown as DiagramDefinitionV13,
      version: 13,
    }),
};
