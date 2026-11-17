import { createOutputLimit } from './outputLimit';
import { runWasi } from './run';
import {
  readDebugSection,
  readVariables,
  structDeclarations,
  TypeDeclaration,
  Variable,
} from './variables';

export type { TypeDeclaration, Variable } from './variables';

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
  /** The variables in scope as the statement starts, innermost first. */
  variables: Record<string, Variable>;
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
  /** The struct types the program's variables use. */
  types: TypeDeclaration[];
};

/** Thrown from the trace callback to stop a program at a limit. */
class LimitReached extends Error {
  constructor(readonly end: RunEnd) {
    super();
  }
}

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
  const debug = readDebugSection(await WebAssembly.compile(wasm));
  const steps: (Step & { frame: number })[] = [];
  type Call = {
    function: string;
    frame: number;
    /** The statement it's on, once it has started one. */
    statement: number | null;
    line: number | null;
    frameBase: number;
  };
  const calls: Call[] = [];
  let outputBeforeFirstStep = '';
  let frames = 0;
  let statementsRun = 0;
  const limitOutput = createOutputLimit();
  const deadline = performance.now() + timeLimitMs;

  const addStep = (call: Call, memory: () => DataView) => {
    const last = steps.at(-1);
    if (call.statement === null || call.line === null) return;
    if (last?.frame === call.frame && last.line === call.line) return;
    steps.push({
      function: call.function,
      line: call.line,
      depth: calls.indexOf(call),
      output: '',
      variables: readVariables(debug, call.statement, call.frameBase, memory()),
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
      onTrace: (event, memory) => {
        if (event.type === 'enter') {
          frames += 1;
          const name = debug.functions[event.function] ?? `function ${event.function}`;
          calls.push({ function: name, frame: frames, statement: null, line: null, frameBase: 0 });
        } else if (event.type === 'line') {
          statementsRun += 1;
          if (statementsRun > stepLimit) throw new LimitReached({ stepLimit });
          if (performance.now() > deadline) throw new LimitReached({ timeLimit: timeLimitMs });
          const call = calls.at(-1);
          if (!call) return;
          call.statement = event.statement;
          call.line = debug.statements[event.statement]?.line ?? null;
          call.frameBase = event.frameBase;
          addStep(call, memory);
        } else {
          calls.pop();
          const caller = calls.at(-1);
          if (caller) addStep(caller, memory);
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
    types: structDeclarations(debug),
  };
};
