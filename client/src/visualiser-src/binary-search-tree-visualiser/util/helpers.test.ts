/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { actualNodeDiameter, nodeDiameter } from '@/visualiser-src/common/constants';
import { treeNodeFontSize } from '@/visualiser-src/common/GenericGraphicalTreeNode';
import { getPointerStartEndCoordinates } from '@/visualiser-src/common/helpers';
import { setUpParityEnvironment } from '@/test/sortingParity';
import { buildAvl, buildBst } from '@/test/treeParity';
import VisualiserController from '@/visualiser-src/controller/VisualiserController';
import type GraphicalBSTNode from '../data-structure/GraphicalBSTNode';
import updateNodePositions from './helpers';

setUpParityEnvironment();

type StubNode = {
  value: number;
  x: number;
  y: number;
  left: StubNode | null;
  right: StubNode | null;
};

const insert = (root: StubNode | null, value: number): StubNode => {
  if (root === null) return { value, x: 0, y: 0, left: null, right: null };
  if (value < root.value) root.left = insert(root.left, value);
  else if (value > root.value) root.right = insert(root.right, value);
  return root;
};

const collect = (node: StubNode | null, out: StubNode[] = []): StubNode[] => {
  if (node === null) return out;
  collect(node.left, out);
  out.push(node);
  collect(node.right, out);
  return out;
};

const nodeCenter = (node: GraphicalBSTNode): [number, number] => [
  Number(node.nodeTarget.cx()),
  Number(node.nodeTarget.cy()),
];

const lineEnd = (line: GraphicalBSTNode['leftLineTarget']): [number, number] => [
  Number(line.attr('x2')),
  Number(line.attr('y2')),
];

const assertEdgeAimed = (
  parent: GraphicalBSTNode,
  side: 'left' | 'right',
  child: GraphicalBSTNode
) => {
  const [px, py] = nodeCenter(parent);
  const [cx, cy] = nodeCenter(child);
  const [, [expectedX, expectedY]] = getPointerStartEndCoordinates(px, py, cx, cy);
  const [actualX, actualY] = lineEnd(
    side === 'left' ? parent.leftLineTarget : parent.rightLineTarget
  );
  expect(actualX).toBeCloseTo(expectedX, 1);
  expect(actualY).toBeCloseTo(expectedY, 1);
};

describe('updateNodePositions', () => {
  it('never overlaps any pair of nodes in deep 14-key BSTs', () => {
    const keys = [3, 2, 13, 6, 14, 1, 8, 9, 11, 12, 10, 7, 4, 5];
    const root = keys.reduce<StubNode | null>((tree, value) => insert(tree, value), null);
    updateNodePositions(root as unknown as GraphicalBSTNode);

    const nodes = collect(root);
    for (let i = 1; i < nodes.length; i += 1) {
      expect(
        nodes[i].x - nodes[i - 1].x,
        `inorder neighbours ${nodes[i - 1].value} and ${nodes[i].value} must clear the ${actualNodeDiameter}px diameter`
      ).toBeGreaterThanOrEqual(actualNodeDiameter);
    }
  });

  it('scales long signed 32-bit key labels to fit within the node circle without changing 1-2 char keys', () => {
    expect(Number(treeNodeFontSize(0))).toBe(24);
    expect(Number(treeNodeFontSize(99))).toBe(24);

    const { bst } = buildBst([0, -2147483648, 2147483647]);
    const left = bst.root!.left!;
    const right = bst.root!.right!;
    expect(Number(bst.root!.textTarget.attr('font-size'))).toBe(24);
    [left, right].forEach((node) => {
      const fontSize = Number(node.textTarget.attr('font-size'));
      expect(fontSize).toBeLessThan(24);
      expect(String(node.value).length * fontSize * 0.65).toBeLessThanOrEqual(nodeDiameter);
    });
  });
});

const pauseTimestamps = (
  allRunners: { runners: { duration: () => number }[]; isTimestamped: boolean }[]
): number[] => {
  const times: number[] = [];
  let cursor = 0;
  allRunners.forEach((step) => {
    if (step.runners.length === 0) return;
    const longest = Math.max(...step.runners.map((runner) => runner.duration()));
    cursor += longest + 25;
    if (step.isTimestamped) times.push(cursor);
  });
  return times;
};

describe('tree step-pause arrow alignment', () => {
  it('keeps parent edge attached to the newly created child at the create pause in BST and AVL', () => {
    const builders = [
      () => {
        const { bst, producer } = buildBst([2, 1]);
        return { root: bst.root!, producer };
      },
      () => {
        const { avl, producer } = buildAvl([2, 1]);
        return { root: avl.root!, producer };
      },
    ];
    builders.forEach((build) => {
      vi.useFakeTimers();
      try {
        const { root, producer } = build();
        const controller = new VisualiserController();
        controller.constructTimeline(producer, () => {});
        controller.pause();
        const child = root.left!;
        const visibleAt = pauseTimestamps(producer.allRunners).find((t) => {
          controller.seekTime(t);
          return Number(child.nodeTarget.attr('opacity')) > 0.5;
        });
        expect(visibleAt).toBeDefined();
        controller.seekTime(visibleAt!);
        assertEdgeAimed(root, 'left', child);
      } finally {
        vi.advanceTimersByTime(100);
        vi.useRealTimers();
      }
    });
  });

  it('re-aims the parent edge to the promoted child before pausing after an inner AVL rotation', () => {
    vi.useFakeTimers();
    try {
      const { avl, producer } = buildAvl([3, 1, 2]);
      const controller = new VisualiserController();
      controller.constructTimeline(producer, () => {});
      controller.pause();
      const firstRotationAt = pauseTimestamps(producer.allRunners).find(
        (t) => (controller.countersAt(t).rotations ?? 0) === 1
      );
      expect(firstRotationAt).toBeDefined();
      controller.seekTime(firstRotationAt!);
      const node2 = avl.root!;
      const node3 = node2.right!;
      assertEdgeAimed(node3, 'left', node2);
    } finally {
      vi.advanceTimersByTime(100);
      vi.useRealTimers();
    }
  });

  it('moves the whole tree and keeps every edge attached at an inner AVL deletion rotation pause', () => {
    vi.useFakeTimers();
    try {
      const { avl, producer: insertProducer } = buildAvl([8, 4, 10, 2, 5, 9, 11, 1, 3]);
      const insertController = new VisualiserController();
      insertController.constructTimeline(insertProducer, () => {});
      insertController.finish();

      const deleteProducer = avl.delete(5);
      const deleteController = new VisualiserController();
      deleteController.constructTimeline(deleteProducer, () => {});
      deleteController.pause();

      const firstRotationAt = pauseTimestamps(deleteProducer.allRunners).find(
        (t) => (deleteController.countersAt(t).rotations ?? 0) === 1
      );
      expect(firstRotationAt).toBeDefined();
      deleteController.seekTime(firstRotationAt!);

      const assertAllEdgesAttached = (node: GraphicalBSTNode | null) => {
        if (node === null) return;
        const [nx, ny] = nodeCenter(node);
        if (node.left !== null) {
          const [cx, cy] = nodeCenter(node.left);
          const [[sx, sy], [ex, ey]] = getPointerStartEndCoordinates(nx, ny, cx, cy);
          expect(Number(node.leftLineTarget.attr('x1'))).toBeCloseTo(sx, 1);
          expect(Number(node.leftLineTarget.attr('y1'))).toBeCloseTo(sy, 1);
          expect(Number(node.leftLineTarget.attr('x2'))).toBeCloseTo(ex, 1);
          expect(Number(node.leftLineTarget.attr('y2'))).toBeCloseTo(ey, 1);
        }
        if (node.right !== null) {
          const [cx, cy] = nodeCenter(node.right);
          const [[sx, sy], [ex, ey]] = getPointerStartEndCoordinates(nx, ny, cx, cy);
          expect(Number(node.rightLineTarget.attr('x1'))).toBeCloseTo(sx, 1);
          expect(Number(node.rightLineTarget.attr('y1'))).toBeCloseTo(sy, 1);
          expect(Number(node.rightLineTarget.attr('x2'))).toBeCloseTo(ex, 1);
          expect(Number(node.rightLineTarget.attr('y2'))).toBeCloseTo(ey, 1);
        }
        assertAllEdgesAttached(node.left);
        assertAllEdgesAttached(node.right);
      };
      assertAllEdgesAttached(avl.root);
    } finally {
      vi.advanceTimersByTime(100);
      vi.useRealTimers();
    }
  });

  it('publishes expanded tree bounds before a new leaf becomes visible so the stage zooms out first', () => {
    const builders = [
      () => {
        const { bst, producer } = buildBst([2, 1]);
        return { child: bst.root!.left!, producer };
      },
      () => {
        const { avl, producer } = buildAvl([2, 1]);
        return { child: avl.root!.left!, producer };
      },
    ];
    builders.forEach((build) => {
      vi.useFakeTimers();
      try {
        const { child, producer } = build();
        const controller = new VisualiserController();
        controller.constructTimeline(producer, () => {});
        controller.pause();

        const initial = controller.boundsAt(0);
        expect(initial).not.toBeNull();

        const firstVisible = pauseTimestamps(producer.allRunners).find((t) => {
          controller.seekTime(t);
          return Number(child.nodeTarget.attr('opacity')) > 0.5;
        });
        expect(firstVisible).toBeDefined();

        const leadTime = Math.max(0, firstVisible! - 600);
        controller.seekTime(leadTime);
        expect(Number(child.nodeTarget.attr('opacity'))).toBeLessThan(0.1);
        const upcoming = controller.boundsAt(leadTime);
        expect(upcoming).not.toBeNull();
        expect(upcoming!.width).toBeGreaterThan(initial!.width);
        expect(upcoming!.height).toBeGreaterThan(initial!.height);
      } finally {
        vi.advanceTimersByTime(100);
        vi.useRealTimers();
      }
    });
  });
});
