import { UserAnnotation } from '../../../Types/annotationType';
import { Addr, BackendState } from '../../../Types/backendType';
import { FrontendLinkedListGraph, EntityConcrete } from '../../../Types/frontendType';
import { Parser } from './parser';
import { LinkedListNode, readLinkedListNodes } from './linkedListHeap';
import { layOutLinkedLists } from './linkedListLayout';
import { buildNodesAndEdges, buildPointerLabels } from './linkedListEntities';

export class LinkedListParser implements Parser {
  parseHeapData(backendStructure: BackendState, annotation: UserAnnotation): LinkedListNode[] {
    return readLinkedListNodes(backendStructure, annotation);
  }

  parseState(
    backendStructure: BackendState,
    annotation: UserAnnotation
  ): FrontendLinkedListGraph | undefined {
    const cacheEntity: { [uid: string]: EntityConcrete } = {};

    const linkedList: LinkedListNode[] = this.parseHeapData(backendStructure, annotation);

    const nodesByUid: Map<Addr, LinkedListNode> = new Map();
    linkedList.forEach((node) => {
      nodesByUid.set(node.uid, node);
    });

    try {
      const nodesPosition = layOutLinkedLists(linkedList, nodesByUid);
      const { nodes, edges } = buildNodesAndEdges(nodesByUid, nodesPosition, cacheEntity);
      const pointers = buildPointerLabels(
        backendStructure,
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
