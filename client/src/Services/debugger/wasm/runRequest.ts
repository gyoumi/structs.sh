import { runWasi } from './run';

/** What the page sends the runner worker: one program to run. */
export type RunRequest = { wasm: Uint8Array<ArrayBuffer> };

/** What the runner worker sends back: output as it's written, then one result. */
export type RunnerMessage =
  | { type: 'output'; text: string }
  | { type: 'finished'; exitCode: number }
  | { type: 'error'; message: string };

/** The most output one run sends the page. More only slows the console down. */
const OUTPUT_LIMIT = 20_000;
/** Writes sent one by one before output is batched. */
const UNBATCHED_WRITES = 50;
/** The smallest batch once output is batched. */
const BATCH_SIZE = 4_096;

/**
 * Sends output on to the page: each write at once for ordinary programs, then
 * in batches for one that prints a lot, and nothing past OUTPUT_LIMIT, so a
 * printing loop can't flood the page.
 */
const createOutputSender = (post: (message: RunnerMessage) => void) => {
  let pending = '';
  let sent = 0;
  let writes = 0;
  let full = false;

  const flush = () => {
    if (!pending) return;
    post({ type: 'output', text: pending });
    pending = '';
  };

  const write = (text: string) => {
    if (full) return;
    const kept = text.slice(0, OUTPUT_LIMIT - sent);
    sent += kept.length;
    pending += kept;
    writes += 1;
    if (kept.length < text.length) {
      full = true;
      pending += `\n[The program's output was stopped after ${OUTPUT_LIMIT.toLocaleString('en')} characters.]\n`;
      flush();
    } else if (writes <= UNBATCHED_WRITES || pending.length >= BATCH_SIZE) {
      flush();
    }
  };

  return { write, flush };
};

/**
 * Runs one program, posting its output as it is written and then either its
 * exit code or why it failed (a trap such as `unreachable`, or a module that
 * won't load). It never rejects, so the page always gets a final message.
 */
export const answerRunRequest = async (
  { wasm }: RunRequest,
  post: (message: RunnerMessage) => void
): Promise<void> => {
  const output = createOutputSender(post);
  try {
    const { exitCode } = await runWasi(wasm, { onOutput: output.write });
    output.flush();
    post({ type: 'finished', exitCode });
  } catch (error) {
    output.flush();
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
