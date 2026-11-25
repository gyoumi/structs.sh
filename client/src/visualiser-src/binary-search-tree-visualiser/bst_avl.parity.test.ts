/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { formatArray, seededCases, setUpParityEnvironment } from '@/test/sortingParity';
import {
  FORCED_24_TARGET,
  TREE_CASES,
  buildAvl,
  buildBst,
  checkCounters,
  wasmForcedSolved,
  wasmTreeCounts,
} from '@/test/treeParity';

/** Needs the challenges wasm built first: `pnpm run challenges` from the repo root. */

const same = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((value, i) => value === b[i]);

/** BST nodes passed and the upset outcome, from GraphicalBST.insertAll and GraphicalAVL.insertAll vs wasm. */
const checkUpset = async (context: string, values: number[]) => {
  const wasm = await wasmTreeCounts(values);
  const { bst, producer } = buildBst(values);
  const bstPreorder = bst.data;
  expect(
    producer.nodesPassed,
    `${context} on ${formatArray(values)}: GraphicalBST.insertAll reported nodesPassed ${producer.nodesPassed}, wasm upset-bst-beats-avl reported bstNodesPassed ${wasm.bstNodesPassed}`
  ).toBe(wasm.bstNodesPassed);
  checkCounters(`${context} on ${formatArray(values)} (BST)`, producer, {
    nodesPassed: producer.nodesPassed,
  });
  const avl = buildAvl(values);
  const avlPreorder = avl.avl.data;
  expect(
    avl.producer.nodesPassed,
    `${context} on ${formatArray(values)}: GraphicalAVL.insertAll reported nodesPassed ${avl.producer.nodesPassed}, wasm upset-bst-beats-avl reported avlNodesPassed ${wasm.avlNodesPassed}`
  ).toBe(wasm.avlNodesPassed);
  const solved = producer.nodesPassed < avl.producer.nodesPassed;
  expect(
    { solved: wasm.solved, margin: wasm.margin },
    `${context} on ${formatArray(values)}: with the visualisers' BST ${producer.nodesPassed} vs AVL ${avl.producer.nodesPassed} nodes passed, wasm should say solved ${solved} (strictly fewer) with margin AVL - BST (0 when unsolved)`
  ).toEqual({ solved, margin: solved ? avl.producer.nodesPassed - producer.nodesPassed : 0 });
  return { wasm, bstPreorder, avlPreorder };
};

/** Forced order is solved exactly when the visualiser's BST preorder equals the target. */
const checkForced = async (context: string, values: number[], targets: number[][]) => {
  const { bst } = buildBst(values);
  const preorder = bst.data;
  const results = await Promise.all(targets.map((target) => wasmForcedSolved(values, target)));
  targets.forEach((target, i) => {
    expect(
      results[i],
      `${context}: inserting ${formatArray(values)} gives GraphicalBST preorder ${formatArray(preorder)}, so wasm bst-forced-order with targetTree ${formatArray(target)} should say solved ${same(preorder, target)}`
    ).toBe(same(preorder, target));
  });
};

setUpParityEnvironment();

describe('BST and AVL nodes-passed parity (GraphicalBST/GraphicalAVL.insertAll vs wasm)', () => {
  it.each(TREE_CASES)('matches for $label', async (expected) => {
    const { label, values } = expected;
    const { wasm, bstPreorder, avlPreorder } = await checkUpset(label, values);
    expect(
      { bstNodesPassed: wasm.bstNodesPassed, avlNodesPassed: wasm.avlNodesPassed, bstPreorder },
      `${label} on ${formatArray(values)}: should match the hand-worked BST ${expected.bstNodesPassed} / AVL ${expected.avlNodesPassed} nodes passed and BST preorder ${formatArray(expected.bstPreorder)}`
    ).toEqual({
      bstNodesPassed: expected.bstNodesPassed,
      avlNodesPassed: expected.avlNodesPassed,
      bstPreorder: expected.bstPreorder,
    });
    if (new Set(values).size !== values.length) return;
    const forced24 = label.startsWith('FORCED_24') ? [FORCED_24_TARGET] : [];
    await checkForced(label, values, [expected.bstPreorder, avlPreorder, ...forced24]);
  });

  it.each(seededCases(20261300, 35, 15))(
    'matches for seed $seed ($kind, length $values.length)',
    async ({ seed, kind, values }) => {
      const context = `seed ${seed} (${kind})`;
      const { wasm, bstPreorder, avlPreorder } = await checkUpset(context, values);
      expect(
        wasm.bstNodesPassed,
        `${context} on ${formatArray(values)}: every insert after the first passes at least the root, so BST nodes passed should be at least ${values.length - 1}, got ${wasm.bstNodesPassed}`
      ).toBeGreaterThanOrEqual(values.length - 1);
      if (kind !== 'permutation') return;
      const ascending = [...values].sort((a, b) => a - b);
      await checkForced(context, values, [bstPreorder, avlPreorder, ascending]);
    }
  );
});
