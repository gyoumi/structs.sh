const PUZZLES_URL = new URL('./generated/puzzles.wasm', import.meta.url);

export type PuzzleInstance = { template: string; values: number[]; fixed: number[] };

/** What the puzzles wasm exports: see crates/structs-puzzles/src/ffi.rs. */
type PuzzlesExports = {
  memory: WebAssembly.Memory;
  alloc: (length: number) => number;
  score: (pointer: number, length: number) => number;
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

let puzzlesLoad: Promise<PuzzlesExports> | null = null;

/** Loads the puzzles wasm once (client/src/Services/puzzles/generated/puzzles.wasm, built by `pnpm run puzzles` from the repo root). A failed load can be tried again. */
export const loadPuzzles = (): Promise<unknown> => {
  puzzlesLoad ??= readBytes(PUZZLES_URL)
    .then((bytes) => WebAssembly.instantiate(bytes, {}))
    .then(({ instance }) => instance.exports as unknown as PuzzlesExports)
    .catch((error) => {
      puzzlesLoad = null;
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `The puzzles could not be loaded (run "pnpm run puzzles" to build them): ${reason}`
      );
    });
  return puzzlesLoad;
};

const callWasm = (puzzles: PuzzlesExports, request: Uint8Array): unknown => {
  const pointer = puzzles.alloc(request.length);
  new Uint8Array(puzzles.memory.buffer, pointer, request.length).set(request);
  const status = puzzles.score(pointer, request.length);
  // Read after the call: the wasm's memory may have grown.
  const reply = new TextDecoder().decode(
    new Uint8Array(puzzles.memory.buffer, puzzles.result_ptr(), puzzles.result_len())
  );
  puzzles.free_result();
  if (status !== 0) throw new Error(reply);
  return JSON.parse(reply);
};

const requestReply = async (request: object): Promise<unknown> => {
  const puzzles = (await loadPuzzles()) as PuzzlesExports;
  return callWasm(puzzles, new TextEncoder().encode(JSON.stringify(request)));
};

/** The score of playing `arrangement` (the whole array, in slot order) on `puzzle`, computed by the Rust code in the wasm build. */
export const scorePuzzle = async (
  puzzle: PuzzleInstance,
  arrangement: number[]
): Promise<number> => {
  const { template, values, fixed } = puzzle;
  const reply = (await requestReply({ template, values, fixed, arrangement })) as {
    score: number;
  };
  return reply.score;
};

export type EvalPuzzleInstance =
  | { template: 'quicksort-most-comparisons'; values: number[]; fixed: number[] }
  | { template: 'bubble-exact-passes'; values: number[]; fixed: number[]; targetPasses: number }
  | { template: 'insertion-beats-merge'; values: number[]; fixed: number[] };

type Outcome<Counts> = ({ solved: true; score: number } | { solved: false; score: null }) & Counts;

export type PuzzleEvaluation =
  | { template: 'quicksort-most-comparisons'; solved: true; score: number }
  | ({ template: 'bubble-exact-passes' } & Outcome<{ passes: number; swaps: number }>)
  | ({ template: 'insertion-beats-merge' } & Outcome<{
      insertionComparisons: number;
      mergeComparisons: number;
      inversions: number;
    }>);

/** What playing `arrangement` on `puzzle` did: whether it solved the puzzle, its score, and the counts behind it, from the wasm build. */
export const evaluatePuzzle = async (
  puzzle: EvalPuzzleInstance,
  arrangement: number[]
): Promise<PuzzleEvaluation> => {
  const reply = await requestReply({ ...puzzle, arrangement });
  if (puzzle.template === 'quicksort-most-comparisons') {
    const { score } = reply as { score: number };
    return { template: puzzle.template, solved: true, score };
  }
  return { template: puzzle.template, ...(reply as object) } as PuzzleEvaluation;
};
