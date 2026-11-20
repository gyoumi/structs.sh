import { StackAnnotation, isStackVariableLabelled } from '../../../Types/annotationType';
import { Addr, BackendState } from '../../../Types/backendType';
import { EntityType } from '../Entities/BaseEntity/baseEntity';
import { EdgeEntity } from '../Entities/BaseEntity/edgeEntity';
import { NodeEntity, DEFAULT_NODE_SIZE } from '../Entities/BaseEntity/nodeEntity';
import { PointerEntity } from '../Entities/BaseEntity/pointerEntity';
import { EntityConcrete } from '../../../Types/frontendType';
import { LinkedListNode } from './linkedListHeap';
import { Position } from './linkedListLayout';

/** A node entity for each list node, and an edge to its next node if that is drawn. */
export function buildNodesAndEdges(
  nodesByUid: Map<Addr, LinkedListNode>,
  nodesPosition: Map<Addr, Position>,
  cacheEntity: { [uid: string]: EntityConcrete }
): { nodes: NodeEntity[]; edges: EdgeEntity[] } {
  const nodes: NodeEntity[] = [];
  const edges: EdgeEntity[] = [];

  nodesByUid.forEach((node, uid) => {
    // Create NodeEntity from LinkedListNode
    const nodeEntity: NodeEntity = {
      uid,
      type: EntityType.NODE,
      label: node.data ? node.data.toString() : '??',
      colorHex: '#FFFFFF',
      size: DEFAULT_NODE_SIZE,
      edgeUids: [],
      // @ts-ignore
      x: nodesPosition.get(uid).x,
      // @ts-ignore
      y: nodesPosition.get(uid).y,
    };
    nodes.push(nodeEntity);
    cacheEntity[uid] = nodeEntity;

    // If there's a next node, create an edge
    if (node.next) {
      const toNode = nodesByUid.get(node.next);
      if (toNode) {
        const edgeEntity: EdgeEntity = {
          uid: `${uid}-${node.next}`,
          type: EntityType.EDGE,
          fromNodeUid: uid,
          toNodeUid: node.next,
          label: '',
          colorHex: '#FFFFFF',
        };
        edges.push(edgeEntity);
        cacheEntity[edgeEntity.uid] = edgeEntity;

        // Attach this edge to the node
        nodeEntity.edgeUids.push(edgeEntity.uid);
      }
    }
  });

  return { nodes, edges };
}

/** A label on each drawn node for the labelled stack variables pointing at it. */
export function buildPointerLabels(
  backendStructure: BackendState,
  stackAnnotation: StackAnnotation,
  nodesByUid: Map<Addr, LinkedListNode>,
  cacheEntity: { [uid: string]: EntityConcrete }
): PointerEntity[] {
  const pointers: PointerEntity[] = [];

  // === Get linked list node pointers from the backend stack data
  Object.entries(backendStructure.stack_data).forEach(([name, memoryValue]) => {
    // Variables carry their type name beside their value (see
    // isLinkedListNode), though MemoryValue doesn't say so.
    const typeName = 'typeName' in memoryValue ? String(memoryValue.typeName) : '';
    if (!isStackVariableLabelled(stackAnnotation, name, typeName)) return;

    // A pointer that isn't to a drawn node (NULL, garbage, or a freed
    // node) gets no label.
    const target = memoryValue.value;
    if (typeof target !== 'string' || !nodesByUid.has(target as Addr)) return;

    const prevPointer = pointers.find((pointer) => pointer.attachedUid === target);
    if (prevPointer) {
      prevPointer.label += `, ${name}`;
      return;
    }

    const annotationEntity: PointerEntity = {
      uid: `${name}`,
      type: EntityType.POINTER,
      attachedUid: target,
      colorHex: '#FFFFFF',
      label: name,
    };
    pointers.push(annotationEntity);
    cacheEntity[annotationEntity.uid] = annotationEntity;
  });

  return pointers;
}
