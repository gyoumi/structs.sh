import type { HashRunResult, HashTableRequest } from './hashTableTypes';
import type { HeapRequest, HeapRunResult } from './heapTypes';

export type { HashOp, HashRunResult, HashSlot, HashStep, HashTableRequest } from './hashTableTypes';
export type { HeapOp, HeapOrder, HeapRequest, HeapRunResult, HeapStep } from './heapTypes';

const CHALLENGES_URL = new URL('./generated/challenges.wasm', import.meta.url);

export type ChallengeInstance = { template: string; values: number[]; fixed: number[] };

/** What the challenges wasm exports: see game-server/challenges/src/ffi.rs. */
type ChallengesExports = {
  memory: WebAssembly.Memory;
  alloc: (length: number) => number;
  score: (pointer: number, length: number) => number;
  step_log: (pointer: number, length: number) => number;
  result_ptr: () => number;
  result_len: () => number;
  free_result: () => void;
};

const readBytes = async (url: URL) => {
  if (url.protocol === 'file:') {
    const { readFile } = await import('node:fs/promises');
    return new Uint8Array(await readFile(url));
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return new Uint8Array(await response.arrayBuffer());
};

let challengesLoad: Promise<ChallengesExports> | null = null;
let loadedChallenges: ChallengesExports | null = null;

/** Loads the challenges wasm once (client/src/Services/challenges/generated/challenges.wasm, built by `pnpm run challenges` from the repo root). A failed load can be tried again. */
export const loadChallenges = (): Promise<unknown> => {
  challengesLoad ??= readBytes(CHALLENGES_URL)
    .then((bytes) => WebAssembly.instantiate(bytes, {}))
    .then(({ instance }) => {
      loadedChallenges = instance.exports as unknown as ChallengesExports;
      return loadedChallenges;
    })
    .catch((error) => {
      challengesLoad = null;
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `The challenges could not be loaded (run "pnpm run challenges" to build them): ${reason}`
      );
    });
  return challengesLoad;
};

/** Whether `loadChallenges()` has resolved, so the wasm build can be called synchronously. */
export const isChallengesLoaded = (): boolean => loadedChallenges !== null;

const callWasm = (
  challenges: ChallengesExports,
  entry: 'score' | 'step_log',
  body: object
): unknown => {
  const request = new TextEncoder().encode(JSON.stringify(body));
  const pointer = challenges.alloc(request.length);
  new Uint8Array(challenges.memory.buffer, pointer, request.length).set(request);
  const status = challenges[entry](pointer, request.length);
  // Read after the call: the wasm's memory may have grown.
  const reply = new TextDecoder().decode(
    new Uint8Array(challenges.memory.buffer, challenges.result_ptr(), challenges.result_len())
  );
  challenges.free_result();
  if (status !== 0) throw new Error(reply);
  return JSON.parse(reply);
};

const requestReply = async (request: object): Promise<unknown> => {
  const challenges = (await loadChallenges()) as ChallengesExports;
  return callWasm(challenges, 'score', request);
};

const loaded = (): ChallengesExports => {
  if (!loadedChallenges) {
    throw new Error('Challenges wasm is not loaded yet; await loadChallenges() first.');
  }
  return loadedChallenges;
};

/** Runs `request.op` on the linear-probing hash table in the wasm build and returns the table and step log. Throws if `loadChallenges()` has not resolved yet. */
export const runHashTableStepLog = (request: HashTableRequest): HashRunResult => {
  const challenges = loaded();
  const { capacity, slots, op } = request;
  return callWasm(challenges, 'step_log', {
    algorithm: 'hash-table-linear',
    capacity,
    slots,
    op,
  }) as HashRunResult;
};

/** Runs `request.op` on the binary heap in the wasm build and returns the heap and step log. Throws if `loadChallenges()` has not resolved yet. */
export const runHeapStepLog = (request: HeapRequest): HeapRunResult => {
  const challenges = loaded();
  const { order, capacity, items, op } = request;
  return callWasm(challenges, 'step_log', {
    algorithm: 'binary-heap',
    order,
    capacity,
    items,
    op,
  }) as HeapRunResult;
};

const MULTI_OUTCOME_TEMPLATES = new Set([
  'bubble-exact-passes',
  'insertion-beats-merge',
  'avl-most-rotations',
  'bst-forced-order',
  'upset-bst-beats-avl',
  'linked-list-index-drift',
]);

/** The score of playing `arrangement` (the whole array, in slot order) on a numeric-score `challenge`, computed by the Rust code in the wasm build. */
export const scoreChallenge = async (
  challenge: ChallengeInstance,
  arrangement: number[]
): Promise<number> => {
  const { template, values, fixed } = challenge;
  if (MULTI_OUTCOME_TEMPLATES.has(template)) {
    throw new Error(`Use evaluateChallenge for "${template}".`);
  }
  const reply = (await requestReply({ template, values, fixed, arrangement })) as {
    score?: unknown;
  };
  if (typeof reply.score !== 'number') {
    throw new Error(
      `Template "${template}" did not return a numeric score; use evaluateChallenge.`
    );
  }
  return reply.score;
};

/** One step of an index drift try, as the wasm build reads it. */
export type ListOperation =
  | { kind: 'insert'; value: number; index: number }
  | { kind: 'delete'; index: number };

export type ArrayEvalChallengeInstance =
  | { template: 'quicksort-most-comparisons'; values: number[]; fixed: number[] }
  | { template: 'bubble-exact-passes'; values: number[]; fixed: number[]; targetPasses: number }
  | { template: 'insertion-beats-merge'; values: number[]; fixed: number[] }
  | { template: 'avl-most-rotations'; values: number[]; fixed: number[] }
  | { template: 'bst-forced-order'; values: number[]; targetTree: number[] }
  | { template: 'upset-bst-beats-avl'; values: number[]; fixed: number[] };

export type ListEvalChallengeInstance = {
  template: 'linked-list-index-drift';
  start: number[];
  target: number[];
};

export type EvalChallengeInstance = ArrayEvalChallengeInstance | ListEvalChallengeInstance;

type Outcome<Counts> = ({ solved: true; score: number } | { solved: false; score: null }) & Counts;

type ArrayChallengeEvaluation =
  | { template: 'quicksort-most-comparisons'; solved: true; score: number }
  | ({ template: 'bubble-exact-passes' } & Outcome<{ passes: number; swaps: number }>)
  | ({ template: 'insertion-beats-merge' } & Outcome<{
      insertionComparisons: number;
      mergeComparisons: number;
      inversions: number;
    }>)
  | { template: 'avl-most-rotations'; solved: true; score: number; rotations: number }
  | ({ template: 'bst-forced-order' } & Outcome<{ longestIncreasingRun: number }>)
  | ({ template: 'upset-bst-beats-avl' } & Outcome<{
      bstNodesPassed: number;
      avlNodesPassed: number;
      margin: number;
    }>);

type IndexDriftEvaluation = { template: 'linked-list-index-drift' } & Outcome<{
  operations: number;
  nodesWalked: number;
  cost: number;
}>;

export type ChallengeEvaluation = ArrayChallengeEvaluation | IndexDriftEvaluation;

/** The exact fields the wasm build takes for `challenge`, dropping anything else the server response carried. */
const wireRequest = (
  challenge: EvalChallengeInstance,
  input: number[] | ListOperation[]
): object => {
  switch (challenge.template) {
    case 'linked-list-index-drift': {
      const { template, start, target } = challenge;
      return { template, start, target, operations: input };
    }
    case 'bst-forced-order': {
      const { template, values, targetTree } = challenge;
      return { template, values, targetTree, arrangement: input };
    }
    case 'bubble-exact-passes': {
      const { template, values, fixed, targetPasses } = challenge;
      return { template, values, fixed, targetPasses, arrangement: input };
    }
    default: {
      const { template, values, fixed } = challenge;
      return { template, values, fixed, arrangement: input };
    }
  }
};

/** What playing `operations` (in order) on an index drift `challenge` did: whether it reached the target, its cost, and the counts behind it, from the wasm build. */
export async function evaluateChallenge(
  challenge: ListEvalChallengeInstance,
  operations: ListOperation[]
): Promise<IndexDriftEvaluation>;
/** What playing `arrangement` on `challenge` did: whether it solved the challenge, its score, and the counts behind it, from the wasm build. */
export async function evaluateChallenge(
  challenge: ArrayEvalChallengeInstance,
  arrangement: number[]
): Promise<ArrayChallengeEvaluation>;
export async function evaluateChallenge(
  challenge: EvalChallengeInstance,
  input: number[] | ListOperation[]
): Promise<ChallengeEvaluation> {
  const reply = await requestReply(wireRequest(challenge, input));
  if (challenge.template === 'quicksort-most-comparisons') {
    const { score } = reply as { score: number };
    return { template: challenge.template, solved: true, score };
  }
  return { template: challenge.template, ...(reply as object) } as ChallengeEvaluation;
}
