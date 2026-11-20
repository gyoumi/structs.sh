import { describe, expect, it } from 'vitest';
import { DataStructureType, UserAnnotation } from '../../../Types/annotationType';
import { BackendState } from '../../../Types/backendType';
import { LinkedListParser } from './linkedListParser';
import gdbState from './fixtures/gdb-linked-list-state.json';
import reverseLine24 from './fixtures/wasm-delete-reverse-line24.json';
import deleteFirstLine18 from './fixtures/wasm-delete-first-line18.json';

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

type Drawing = NonNullable<ReturnType<LinkedListParser['parseState']>>;

/** The graph parseState drew, failing with `where` in the message if it drew nothing. */
const drawing = (graph: Drawing | undefined, where: string): Drawing => {
  if (graph === undefined)
    throw new Error(`${where}: parseState returned undefined instead of a drawing`);
  return graph;
};

describe('LinkedListParser', () => {
  const graph = drawing(
    new LinkedListParser().parseState(state, annotation),
    'linked_list.c line 20 (GDB recording, list 1 -> 2 -> 3, list annotated)'
  );
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

// Pointer variables that point at no drawn node: NULL, uninitialised, or at a
// node that was freed. The user saw the drawing go blank (or stay on the
// previous step's picture) at every such step, with "Cannot read properties of
// undefined (reading 'uid')" in the console.
//
// Both states were recorded from the wasm debugger (recordRun in
// Services/debugger/wasm/recording.ts, on e2e/programs/delete.c), converted
// to the BackendState the page gets the way WasmDebugger's stateAt() does,
// and checked against the source by hand:
// - wasm-delete-reverse-line24.json: reverse(), first time round the loop,
//   stopped on line 24 before `next` is assigned. The list is 1 -> 2 -> 3.
//   head = 0x102a0 (node 1), prev = 0x0 (NULL, set on line 22), next =
//   0xaaaaaaaa (uninitialised: the wasm stack starts filled with 0xAA, which
//   is not a heap address).
// - wasm-delete-first-line18.json: delete_first(), stopped on line 18 after
//   free(head) on line 17. The heap holds nodes 2 and 1; head = 0x10280 still
//   points at the freed node 3, rest = 0x10290 (node 2).
describe('LinkedListParser with pointers that point at no drawn node', () => {
  const pointerAnnotation = (...names: string[]): UserAnnotation => ({
    typeAnnotation: annotation.typeAnnotation,
    stackAnnotation: Object.fromEntries(names.map((name) => [name, { typeName: 'struct node *' }])),
  });

  /** Parses, turning a throw into a message that says which program state it was. */
  const parse = (input: BackendState, names: string[], where: string) => {
    try {
      return new LinkedListParser().parseState(input, pointerAnnotation(...names));
    } catch (error) {
      throw new Error(
        `${where}: LinkedListParser.parseState threw with stack pointers ${names.join(', ')} annotated: ${error}`
      );
    }
  };

  /** "node <value>" for a pointer's node, or what it is attached to if that is no node. */
  const describePointers = (graph: Drawing) =>
    graph.pointers.map((pointer) => {
      const node = graph.nodes.find((candidate) => candidate.uid === pointer.attachedUid);
      return `${pointer.label} -> ${node ? `node ${node.label}` : `no drawn node (${pointer.attachedUid})`}`;
    });

  describe('delete.c reverse() line 24: head -> node 1, prev = NULL (0x0), next uninitialised (0xaaaaaaaa)', () => {
    const where = 'delete.c reverse() line 24 (head -> node 1, prev = 0x0, next = 0xaaaaaaaa)';
    const input = reverseLine24 as unknown as BackendState;

    it('draws every node on the heap', () => {
      const graph = drawing(parse(input, ['head', 'prev', 'next'], where), where);
      expect(
        graph.nodes.map((node) => node.label).sort(),
        `${where}: labels of the nodes drawn (the heap holds 1 -> 2 -> 3)`
      ).toEqual(['1', '2', '3']);
    });

    it('links the nodes as the heap does', () => {
      const graph = drawing(parse(input, ['head', 'prev', 'next'], where), where);
      const links = graph.edges.map(
        (edge) =>
          `${graph.cacheEntity[edge.fromNodeUid]?.label} -> ${graph.cacheEntity[edge.toNodeUid]?.label}`
      );
      expect(links.sort(), `${where}: edges drawn`).toEqual(['1 -> 2', '2 -> 3']);
    });

    it('labels only the pointer that points at a node', () => {
      const graph = drawing(parse(input, ['head', 'prev', 'next'], where), where);
      expect(
        describePointers(graph),
        `${where}: pointer labels drawn; prev (NULL) and next (uninitialised) point at no node, so only head is drawn`
      ).toEqual(['head -> node 1']);
    });
  });

  describe('delete.c delete_first() line 18: head -> freed node, rest -> node 2', () => {
    const where = 'delete.c delete_first() line 18 (head -> freed 0x10280, rest -> node 2)';
    const input = deleteFirstLine18 as unknown as BackendState;

    it('draws the nodes still on the heap and labels only the pointer to one of them', () => {
      const graph = drawing(parse(input, ['head', 'rest'], where), where);
      expect(
        graph.nodes.map((node) => node.label).sort(),
        `${where}: labels of the nodes drawn (the heap holds 2 -> 1; node 3 was freed on line 17)`
      ).toEqual(['1', '2']);
      expect(
        describePointers(graph),
        `${where}: pointer labels drawn; head points at the freed node, so only rest is drawn`
      ).toEqual(['rest -> node 2']);
    });
  });
});
