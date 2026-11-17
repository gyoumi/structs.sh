import { describe, expect, it } from 'vitest';
import { DataStructureType, UserAnnotation } from '../../../Types/annotationType';
import { BackendState } from '../../../Types/backendType';
import { LinkedListParser } from './linkedListParser';
import gdbState from './fixtures/gdb-linked-list-state.json';

// Recorded from the GDB debugger, stopped at line 20 of
// e2e/programs/linked_list.c, after the list 1 -> 2 -> 3 has been built.
//
// This is what GDB really sends, and it doesn't match the BackendState type:
// fields use `kind` instead of `typeName`, and frame_info has no `line`.
// The wasm debugger has to produce the same shape, or the parser has to
// change, so this test pins down what the parser accepts today.
const state = gdbState as unknown as BackendState;

const annotation: UserAnnotation = {
  typeAnnotation: {
    'struct node': {
      typeName: 'struct node',
      type: DataStructureType.LinkedList,
      value: { typeName: 'int', name: 'value' },
      next: { typeName: 'struct node *', name: 'next' },
    },
  },
  stackAnnotation: {
    list: { typeName: 'struct node *' },
  },
};

describe('LinkedListParser', () => {
  const graph = new LinkedListParser().parseState(state, annotation);
  const nodeAt = (label: string) => graph.nodes.find((node) => node.label === label)!;

  it('draws one node per list element', () => {
    expect(graph.nodes.map((node) => node.label).sort()).toEqual(['1', '2', '3']);
  });

  it('links each node to the next one', () => {
    const links = graph.edges.map(
      (edge) =>
        `${graph.cacheEntity[edge.fromNodeUid].label} -> ${graph.cacheEntity[edge.toNodeUid].label}`
    );
    expect(links.sort()).toEqual(['1 -> 2', '2 -> 3']);
  });

  it('places the nodes left to right in list order', () => {
    expect(nodeAt('1').x).toBeLessThan(nodeAt('2').x);
    expect(nodeAt('2').x).toBeLessThan(nodeAt('3').x);
  });

  it('points the annotated stack variable at the head of the list', () => {
    expect(graph.pointers).toHaveLength(1);
    expect(graph.pointers[0].label).toBe('list');
    expect(graph.pointers[0].attachedUid).toBe(nodeAt('1').uid);
  });
});
