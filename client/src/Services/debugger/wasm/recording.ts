import { createOutputLimit } from './outputLimit';
import { runWasi } from './run';

/**
 * How many statements a program may run before it is stopped. Repeats that
 * don't become steps count too, so a loop that only repeats one line still
 * stops.
 */
export const STEP_LIMIT = 100_000;

/** How long a program may run before it is stopped, in milliseconds. */
export const TIME_LIMIT_MS = 10_000;

/** One statement, in the order a student steps through them. */
export type Step = {
  /** The C name of the function it's in. */
  function: string;
  line: number;
  /** 0 in main, 1 in a function main called, and so on. */
  depth: number;
  /** What the program printed while running this statement. */
  output: string;
};

export type RunEnd =
  | { exitCode: number }
  | { crashed: string }
  | { stepLimit: number }
  | { timeLimit: number };

export type Recording = {
  steps: Step[];
  /** Anything printed before the first statement, which is rare. */
  outputBeforeFirstStep: string;
  end: RunEnd;
};

/** Thrown from the trace callback to stop a program at a limit. */
class LimitReached extends Error {
  constructor(readonly end: RunEnd) {
    super();
  }
}

/** The names in an instrumented program's `structs.functions` section. */
const functionNames = (module: WebAssembly.Module): string[] => {
  const [section] = WebAssembly.Module.customSections(module, 'structs.functions');
  return section ? JSON.parse(new TextDecoder().decode(section)) : [];
};

/**
 * Runs an instrumented program to the end and records its steps. A step is
 * one statement: a repeat of the same line in the same call is skipped, and
 * returning from a call is a step back on the caller's line, as GDB shows it.
 * A program that runs too many statements, or for too long, is stopped, and
 * its steps up to then are kept.
 */
export const recordRun = async (
  wasm: Uint8Array<ArrayBuffer>,
  {
    stepLimit = STEP_LIMIT,
    timeLimitMs = TIME_LIMIT_MS,
  }: { stepLimit?: number; timeLimitMs?: number } = {}
): Promise<Recording> => {
  const names = functionNames(await WebAssembly.compile(wasm));
  const steps: (Step & { frame: number })[] = [];
  const calls: { function: string; frame: number; line: number | null }[] = [];
  let outputBeforeFirstStep = '';
  let frames = 0;
  let statementsRun = 0;
  const limitOutput = createOutputLimit();
  const deadline = performance.now() + timeLimitMs;

  const addStep = (call: (typeof calls)[number]) => {
    const last = steps.at(-1);
    if (call.line === null || (last?.frame === call.frame && last.line === call.line)) return;
    steps.push({
      function: call.function,
      line: call.line,
      depth: calls.indexOf(call),
      output: '',
      frame: call.frame,
    });
  };

  let end: RunEnd;
  try {
    const { exitCode } = await runWasi(wasm, {
      onOutput: (text) => {
        const kept = limitOutput(text);
        const last = steps.at(-1);
        if (last) last.output += kept;
        else outputBeforeFirstStep += kept;
      },
      onTrace: (event) => {
        if (event.type === 'enter') {
          frames += 1;
          const name = names[event.function] ?? `function ${event.function}`;
          calls.push({ function: name, frame: frames, line: null });
        } else if (event.type === 'line') {
          statementsRun += 1;
          if (statementsRun > stepLimit) throw new LimitReached({ stepLimit });
          if (performance.now() > deadline) throw new LimitReached({ timeLimit: timeLimitMs });
          const call = calls.at(-1);
          if (!call) return;
          call.line = event.line;
          addStep(call);
        } else {
          calls.pop();
          const caller = calls.at(-1);
          if (caller) addStep(caller);
        }
      },
    });
    end = { exitCode };
  } catch (error) {
    if (error instanceof LimitReached) end = error.end;
    else end = { crashed: error instanceof Error ? error.message : String(error) };
  }

  return {
    steps: steps.map(({ frame: _frame, ...step }) => step),
    outputBeforeFirstStep,
    end,
  };
};
