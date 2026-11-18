import { recordRun, Recording } from './recording';

/**
 * What the page sends the runner worker: one instrumented program to record,
 * and the input typed for it so far.
 */
export type RunRequest = {
  wasm: Uint8Array<ArrayBuffer>;
  input?: { text: string; eof: boolean };
};

/** What the runner worker sends back: one message, once the program ends. */
export type RunnerMessage =
  | { type: 'recorded'; recording: Recording }
  | { type: 'error'; message: string };

/**
 * Records one program and posts the recording, or why it couldn't be
 * recorded, such as a module that won't load. A program that crashes or hits
 * a limit still has a recording (see recordRun). It never rejects, so the
 * page always gets a message.
 */
export const answerRunRequest = async (
  { wasm, input }: RunRequest,
  post: (message: RunnerMessage) => void
): Promise<void> => {
  try {
    post({ type: 'recorded', recording: await recordRun(wasm, { input }) });
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
