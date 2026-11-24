import { describe, expect, it } from 'vitest';
import { AstIds, nodeId } from './index.js';

describe('AstIds (semantic AST ids, D69)', () => {
  it('names nodes by user id and numbers later mentions', () => {
    const ids = new AstIds();
    expect([ids.node('A'), ids.node('B'), ids.node('A'), ids.node('A')]).toEqual([
      'n:A',
      'n:B',
      'n:A@2',
      'n:A@3',
    ]);
  });

  it('nodeId is the uncounted id of a first mention, escaped the same way', () => {
    for (const name of ['A', 'a%b', 'x>y', 'p@q#r']) {
      expect(nodeId(name)).toBe(new AstIds().node(name));
    }
    const ids = new AstIds();
    ids.node('A');
    expect(nodeId('A')).toBe('n:A');
    expect(ids.node('A')).toBe('n:A@2');
  });

  it('names edges by endpoints and numbers parallel edges; direction matters', () => {
    const ids = new AstIds();
    expect([ids.edge('A', 'B'), ids.edge('B', 'A'), ids.edge('A', 'B')]).toEqual([
      'e:A>B',
      'e:B>A',
      'e:A>B#2',
    ]);
  });

  it('names subgraphs by id', () => {
    const ids = new AstIds();
    expect([ids.subgraph('one'), ids.subgraph('two'), ids.subgraph('one')]).toEqual([
      's:one',
      's:two',
      's:one@2',
    ]);
  });

  it('names unnamed statements by kind and 1-based ordinal among statements of that kind', () => {
    const ids = new AstIds();
    expect([
      ids.statement('st'),
      ids.statement('cd'),
      ids.statement('st'),
      ids.statement('st'),
    ]).toEqual(['st:1', 'cd:1', 'st:2', 'st:3']);
  });

  it('escapes the separator characters so ids never collide', () => {
    const ids = new AstIds();
    expect(ids.node('a@2')).toBe('n:a%402');
    expect(ids.node('a')).toBe('n:a');
    expect(ids.node('a')).toBe('n:a@2');
    expect(ids.edge('x>y', 'z')).toBe('e:x%3Ey>z');
    expect(ids.edge('x', 'y>z')).toBe('e:x>y%3Ez');
    expect(ids.edge('a#2', 'b')).toBe('e:a%232>b');
    expect(ids.node('100%')).toBe('n:100%25');
  });

  it('keeps no shared state: each parse gets its own allocator', () => {
    const first = new AstIds();
    first.node('A');
    expect(new AstIds().node('A')).toBe('n:A');
  });
});
