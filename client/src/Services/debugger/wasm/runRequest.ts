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

/**
 * Sends each write on to the page as it happens, so nothing is held back if
 * the program then never ends, and nothing past OUTPUT_LIMIT. The page
 * batches what it receives (see workerRunner.ts).
 */
const createOutputSender = (post: (message: RunnerMessage) => void) => {
  let sent = 0;
  let full = false;

  return (text: string) => {
    if (full) return;
    const kept = text.slice(0, OUTPUT_LIMIT - sent);
    sent += kept.length;
    if (kept.length < text.length) {
      full = true;
      post({
        type: 'output',
        text: `${kept}\n[The program's output was stopped after ${OUTPUT_LIMIT.toLocaleString('en')} characters.]\n`,
      });
    } else if (kept) {
      post({ type: 'output', text: kept });
    }
  };
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
  const onOutput = createOutputSender(post);
  try {
    const { exitCode } = await runWasi(wasm, { onOutput });
    post({ type: 'finished', exitCode });
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
