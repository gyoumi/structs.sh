/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { formatArray, seededCases, setUpParityEnvironment } from '@/test/sortingParity';
import { TREE_CASES, buildAvl, checkCounters, wasmTreeCounts } from '@/test/treeParity';

/** Needs the puzzles wasm built first: `pnpm run puzzles` from the repo root. */

type Shape = { keys: number[]; unbalancedAt: number | null };

/** Rebuilds a BST from its preorder (inserting a preorder rebuilds the same tree) and reports its shape. */
const shapeOf = (preorder: number[]): Shape => {
  type Node = { value: number; left: Node | null; right: Node | null };
  let root: Node | null = null;
  preorder.forEach((value) => {
    const node: Node = { value, left: null, right: null };
    if (root === null) {
      root = node;
      return;
    }
    let at: Node = root;
    for (;;) {
      const side = value < at.value ? 'left' : 'right';
      const next: Node | null = at[side];
      if (next === null) {
        at[side] = node;
        return;
      }
      at = next;
    }
  });
  let unbalancedAt: number | null = null;
  const keys: number[] = [];
  const walk = (node: Node | null): number => {
    if (node === null) return 0;
    const left = walk(node.left);
    keys.push(node.value);
    const right = walk(node.right);
    if (Math.abs(left - right) > 1 && unbalancedAt === null) unbalancedAt = node.value;
    return 1 + Math.max(left, right);
  };
  walk(root);
  return { keys, unbalancedAt };
};

const checkParity = async (context: string, values: number[]) => {
  const wasm = await wasmTreeCounts(values);
  const { avl, producer } = buildAvl(values);
  const ts = { rotations: producer.rotations, nodesPassed: producer.nodesPassed };
  expect(
    ts,
    `${context} on ${formatArray(values)}: GraphicalAVL.insertAll reported rotations ${ts.rotations} / nodesPassed ${ts.nodesPassed}, wasm reported rotations ${wasm.rotations} (avl-most-rotations) / avlNodesPassed ${wasm.avlNodesPassed} (upset-bst-beats-avl)`
  ).toEqual({ rotations: wasm.rotations, nodesPassed: wasm.avlNodesPassed });
  checkCounters(`${context} on ${formatArray(values)} (AVL)`, producer, ts);
  const preorder = avl.data;
  const shape = shapeOf(preorder);
  const distinct = [...new Set(values)].sort((a, b) => a - b);
  expect(
    shape,
    `${context} on ${formatArray(values)}: avl.data ${formatArray(preorder)} should be the preorder of an AVL tree (no node with subtree heights more than 1 apart) holding each distinct key once`
  ).toEqual({ keys: distinct, unbalancedAt: null });
  return { ...wasm, preorder };
};

setUpParityEnvironment();

describe('AVL rotation and nodes-passed parity (GraphicalAVL.insertAll vs wasm)', () => {
  it.each(TREE_CASES)('matches for $label', async (expected) => {
    const { label, values } = expected;
    const got = await checkParity(label, values);
    expect(
      { rotations: got.rotations, avlNodesPassed: got.avlNodesPassed, preorder: got.preorder },
      `${label} on ${formatArray(values)}: should match the hand-worked rotations ${expected.rotations}, AVL nodes passed ${expected.avlNodesPassed} and preorder ${formatArray(expected.avlPreorder)}`
    ).toEqual({
      rotations: expected.rotations,
      avlNodesPassed: expected.avlNodesPassed,
      preorder: expected.avlPreorder,
    });
  });

  it.each(seededCases(20261125, 35, 15))(
    'matches for seed $seed ($kind, length $values.length)',
    async ({ seed, kind, values }) => {
      const got = await checkParity(`seed ${seed} (${kind})`, values);
      const keys = new Set(values).size;
      expect(
        got.rotations,
        `seed ${seed} (${kind}) on ${formatArray(values)}: each insert rotates at most twice, so ${keys} keys make at most ${2 * keys} rotations, got ${got.rotations}`
      ).toBeLessThanOrEqual(2 * keys);
    }
  );
});
