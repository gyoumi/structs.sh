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

const scoreInWasm = (puzzles: PuzzlesExports, request: Uint8Array): number => {
  const pointer = puzzles.alloc(request.length);
  new Uint8Array(puzzles.memory.buffer, pointer, request.length).set(request);
  const status = puzzles.score(pointer, request.length);
  // Read after the call: the wasm's memory may have grown.
  const reply = new TextDecoder().decode(
    new Uint8Array(puzzles.memory.buffer, puzzles.result_ptr(), puzzles.result_len())
  );
  puzzles.free_result();
  if (status !== 0) throw new Error(reply);
  return (JSON.parse(reply) as { score: number }).score;
};

/** The score of playing `arrangement` (the whole array, in slot order) on `puzzle`, computed by the Rust code in the wasm build. */
export const scorePuzzle = async (
  puzzle: PuzzleInstance,
  arrangement: number[]
): Promise<number> => {
  const puzzles = (await loadPuzzles()) as PuzzlesExports;
  const { template, values, fixed } = puzzle;
  const request = new TextEncoder().encode(
    JSON.stringify({ template, values, fixed, arrangement })
  );
  return scoreInWasm(puzzles, request);
};
