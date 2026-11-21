import { UserAnnotation } from '../../../Types/annotationType';
import { Addr, ProgramState } from '../../../Types/programState';
import { FrontendLinkedListGraph, EntityConcrete } from '../../../Types/frontendType';
import { Parser } from './parser';
import { LinkedListNode, readLinkedListNodes } from './linkedListHeap';
import { layOutLinkedLists } from './linkedListLayout';
import { buildNodesAndEdges, buildPointerLabels } from './linkedListEntities';

export class LinkedListParser implements Parser {
  parseHeapData(programState: ProgramState, annotation: UserAnnotation): LinkedListNode[] {
    return readLinkedListNodes(programState, annotation);
  }

  parseState(
    programState: ProgramState,
    annotation: UserAnnotation
  ): FrontendLinkedListGraph | undefined {
    const cacheEntity: { [uid: string]: EntityConcrete } = {};

    const linkedList: LinkedListNode[] = this.parseHeapData(programState, annotation);

    const nodesByUid: Map<Addr, LinkedListNode> = new Map();
    linkedList.forEach((node) => {
      nodesByUid.set(node.uid, node);
    });

    try {
      const nodesPosition = layOutLinkedLists(linkedList, nodesByUid);
      const { nodes, edges } = buildNodesAndEdges(nodesByUid, nodesPosition, cacheEntity);
      const pointers = buildPointerLabels(
        programState,
        annotation.stackAnnotation,
        nodesByUid,
        cacheEntity
      );

      return {
        nodes,
        edges,
        cacheEntity,
        pointers,
      };
    } catch (e: any) {
      console.error(e.message);
      return undefined;
    }
  }
}
