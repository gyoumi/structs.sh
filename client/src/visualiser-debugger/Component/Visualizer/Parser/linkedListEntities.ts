import { StackAnnotation, isStackVariableLabelled } from '../../../Types/annotationType';
import { Addr, BackendState } from '../../../Types/backendType';
import { EntityType } from '../Entities/BaseEntity/baseEntity';
import { EdgeEntity } from '../Entities/BaseEntity/edgeEntity';
import { NodeEntity, DEFAULT_NODE_SIZE } from '../Entities/BaseEntity/nodeEntity';
import { PointerEntity } from '../Entities/BaseEntity/pointerEntity';
import { EntityConcrete } from '../../../Types/frontendType';
import { LinkedListNode } from './linkedListHeap';
import { Position } from './linkedListLayout';

function laidOutPosition(nodesPosition: Map<Addr, Position>, uid: Addr): Position {
  const position = nodesPosition.get(uid);
  if (!position) throw new Error(`The layout gave no position to node ${uid}`);
  return position;
}

/** A node entity for each list node, and an edge to its next node if that is drawn. */
export function buildNodesAndEdges(
  nodesByUid: Map<Addr, LinkedListNode>,
  nodesPosition: Map<Addr, Position>,
  cacheEntity: { [uid: string]: EntityConcrete }
): { nodes: NodeEntity[]; edges: EdgeEntity[] } {
  const nodes: NodeEntity[] = [];
  const edges: EdgeEntity[] = [];

  nodesByUid.forEach((node, uid) => {
    const { x, y } = laidOutPosition(nodesPosition, uid);
    const nodeEntity: NodeEntity = {
      uid,
      type: EntityType.NODE,
      label: node.data ? node.data.toString() : '??',
      colorHex: '#FFFFFF',
      size: DEFAULT_NODE_SIZE,
      edgeUids: [],
      x,
      y,
    };
    nodes.push(nodeEntity);
    cacheEntity[uid] = nodeEntity;

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

  Object.entries(backendStructure.stack_data).forEach(([name, memoryValue]) => {
    if (!isStackVariableLabelled(stackAnnotation, name, memoryValue.typeName)) return;

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
