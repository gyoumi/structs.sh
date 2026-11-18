import { createOutputLimit } from './outputLimit';
import { runWasi } from './run';
import {
  Allocation,
  HeapEntry,
  readDebugSection,
  readHeap,
  readVariables,
  structDeclarations,
  TypeDeclaration,
  Variable,
} from './variables';

export type { HeapEntry, TypeDeclaration, Variable } from './variables';

/**
 * How many statements a program may run before it is stopped. Repeats that
 * don't become steps count too, so a loop that only repeats one line still
 * stops.
 */
export const STEP_LIMIT = 100_000;

/** How long a program may run before it is stopped, in milliseconds. */
export const TIME_LIMIT_MS = 10_000;

/**
 * Roughly how many bytes of snapshots a recording may hold (measured as
 * JSON), so a program with a big heap that changes on every step can't use
 * up the browser's memory.
 */
export const SIZE_LIMIT = 50_000_000;

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
  /**
   * The structs on the heap that any frame's variables reach, by address. An
   * entry that didn't change since the step before is the same object.
   */
  heap: Record<string, HeapEntry>;
};

export type RunEnd =
  | { exitCode: number }
  | { crashed: string }
  | { stepLimit: number }
  | { timeLimit: number }
  | { sizeLimit: number };

export type Recording = {
  steps: Step[];
  /** Anything printed before the first statement, which is rare. */
  outputBeforeFirstStep: string;
  end: RunEnd;
  /** The struct types the program's variables use. */
  types: TypeDeclaration[];
};

/** Roughly what a step's reference to a shared heap entry costs, in bytes. */
const REFERENCE_SIZE = 16;

/** JSON writes NaN and Infinity as null: keep them apart when comparing. */
const keepSpecialNumbers = (_key: string, value: unknown) =>
  typeof value === 'number' && !Number.isFinite(value) ? String(value) : value;

/** wasm passes pointers and sizes as signed 32-bit numbers. */
const unsigned = (value: number) => (value < 0 ? value + 2 ** 32 : value);

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
    sizeLimit = SIZE_LIMIT,
  }: { stepLimit?: number; timeLimitMs?: number; sizeLimit?: number } = {}
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

  const checkTime = () => {
    if (performance.now() > deadline) throw new LimitReached({ timeLimit: timeLimitMs });
  };

  /** The heap blocks in use: their start, and size. */
  const allocations = new Map<number, number>();
  /** The blocks' starts in order, rebuilt after the blocks change. */
  let starts: number[] | null = null;
  const allocationOf = (address: number): Allocation | null => {
    if (address < 1024) return null;
    const exact = allocations.get(address);
    if (exact !== undefined) return { start: address, size: exact };
    starts ??= [...allocations.keys()].sort((a, b) => a - b);
    // The last block starting at or before the address.
    let low = 0;
    let high = starts.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (starts[middle] <= address) low = middle + 1;
      else high = middle;
    }
    if (low === 0) return null;
    const start = starts[low - 1];
    const size = allocations.get(start)!;
    return address < start + size ? { start, size } : null;
  };

  /** The last step's heap entries, as JSON, to share the ones that don't change. */
  let previousHeap = new Map<string, { entry: HeapEntry; json: string }>();
  let recordedSize = 0;

  const addStep = (call: Call, memory: () => DataView) => {
    const last = steps.at(-1);
    if (call.statement === null || call.line === null) return;
    if (last?.frame === call.frame && last.line === call.line) return;
    const view = memory();
    const variables = readVariables(debug, call.statement, call.frameBase, view);
    const callFrames = calls.flatMap(({ statement, frameBase }) =>
      statement === null ? [] : [{ statement, frameBase }]
    );

    let size = JSON.stringify(variables).length;
    const heap: Record<string, HeapEntry> = Object.create(null);
    const seen = new Map<string, { entry: HeapEntry; json: string }>();
    Object.entries(readHeap(debug, callFrames, view, allocationOf, checkTime)).forEach(
      ([address, entry]) => {
        const json = JSON.stringify(entry, keepSpecialNumbers);
        // Every step holds a reference to each entry, shared or not.
        size += address.length + REFERENCE_SIZE;
        const before = previousHeap.get(address);
        if (before?.json === json) {
          heap[address] = before.entry;
          seen.set(address, before);
        } else {
          heap[address] = entry;
          seen.set(address, { entry, json });
          size += json.length;
        }
      }
    );
    if (recordedSize + size > sizeLimit) throw new LimitReached({ sizeLimit });
    recordedSize += size;
    previousHeap = seen;

    steps.push({
      function: call.function,
      line: call.line,
      depth: calls.indexOf(call),
      output: '',
      variables,
      heap,
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
          checkTime();
          const call = calls.at(-1);
          if (!call) return;
          call.statement = event.statement;
          call.line = debug.statements[event.statement]?.line ?? null;
          call.frameBase = event.frameBase;
          addStep(call, memory);
        } else if (event.type === 'exit') {
          calls.pop();
          const caller = calls.at(-1);
          if (caller) addStep(caller, memory);
        } else if (event.type === 'allocated') {
          if (event.pointer !== 0) allocations.set(unsigned(event.pointer), unsigned(event.size));
          starts = null;
        } else if (event.type === 'freed') {
          allocations.delete(unsigned(event.pointer));
          starts = null;
        } else if (event.pointer !== 0) {
          allocations.delete(unsigned(event.old));
          allocations.set(unsigned(event.pointer), unsigned(event.size));
          starts = null;
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
