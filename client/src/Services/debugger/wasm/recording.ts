import { createOutputLimit } from './outputLimit';
import { runWasi, WAITING_FOR_INPUT } from './run';
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
   * The structs on the heap that any frame's variables reach, and those shown
   * at an earlier step that aren't freed yet, by address. An entry that didn't
   * change since the step before is the same object.
   */
  heap: Record<string, HeapEntry>;
};

export type RunEnd =
  | { exitCode: number }
  | { crashed: string }
  | { stepLimit: number }
  | { timeLimit: number }
  | { sizeLimit: number }
  /**
   * It read past the input typed so far; typing more records it again. `at`
   * is where it's paused when that's in a call with no step since a call it
   * made returned (as in `scanf("%d", &values[slot()])`), so the last step
   * isn't where it is. It's not a step, as stepping on after more input is
   * typed goes by step number.
   */
  | { waitingForInput: true; at?: Step };

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

/** JSON writes NaN and Infinity as null, and -0 as 0: keep them apart when comparing. */
const keepSpecialNumbers = (_key: string, value: unknown) => {
  if (typeof value !== 'number') return value;
  if (Object.is(value, -0)) return '-0';
  return Number.isFinite(value) ? value : String(value);
};

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
 * one statement: a repeat of the same line in the same call is skipped, even
 * after a call made from that line returns. Returning from a call isn't a
 * step: after a function's last step comes the caller's next statement, as
 * the call's result may not be stored yet (a new list node reachable only from
 * it would vanish from the heap for that step). So a program that crashes in
 * a caller just after a call returns ends with a step on the caller's line.
 * A program that runs too many statements, or for too long, is stopped, and
 * its steps up to then are kept.
 */
export const recordRun = async (
  wasm: Uint8Array<ArrayBuffer>,
  {
    stepLimit = STEP_LIMIT,
    timeLimitMs = TIME_LIMIT_MS,
    sizeLimit = SIZE_LIMIT,
    input = { text: '', eof: false },
  }: {
    stepLimit?: number;
    timeLimitMs?: number;
    sizeLimit?: number;
    /** stdin: the text typed so far, and whether end-of-file was sent. */
    input?: { text: string; eof: boolean };
  } = {}
): Promise<Recording> => {
  const debug = readDebugSection(await WebAssembly.compile(wasm));
  const steps: Step[] = [];
  type Call = {
    function: string;
    /** The statement it's on, once it has started one. */
    statement: number | null;
    line: number | null;
    frameBase: number;
    /** The line of its latest step, so a repeat of it isn't a new step. */
    steppedLine: number | null;
    /** Whether a call it made has returned since its latest step. */
    returnedTo: boolean;
  };
  const calls: Call[] = [];
  let outputBeforeFirstStep = '';
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

  /**
   * The structs shown so far, as their address and type, by the start of the
   * live allocation they're in. Each is shown at every step until it's freed,
   * even when no variable reaches it any more (a node that's only a call's
   * return value, or a leak).
   */
  const shown = new Map<number, Map<number, number>>();
  const remember = (address: number, type: number) => {
    const allocation = allocationOf(address);
    if (allocation === null) return;
    let structs = shown.get(allocation.start);
    if (!structs) {
      structs = new Map();
      shown.set(allocation.start, structs);
    }
    structs.set(address, type);
  };
  /**
   * Forgets a struct whose memory now holds a different one, but not another
   * struct remembered at the same address since, such as the one there now.
   */
  const forget = (address: number, type: number) => {
    const allocation = allocationOf(address);
    const structs = allocation && shown.get(allocation.start);
    if (structs?.get(address) === type) structs.delete(address);
  };
  const shownRoots = () =>
    [...shown.values()].flatMap((structs) =>
      [...structs].map(([address, type]): [number, number] => [type, address])
    );

  /** The last step's heap entries, as JSON, to share the ones that don't change. */
  let previousHeap = new Map<string, { entry: HeapEntry; json: string }>();
  let recordedSize = 0;

  /** What a call shows now, counted toward the size limit. */
  const readStep = (call: Call, memory: () => DataView): Step | null => {
    if (call.statement === null || call.line === null) return null;
    const view = memory();
    const variables = readVariables(debug, call.statement, call.frameBase, view);
    const callFrames = calls.flatMap(({ statement, frameBase }) =>
      statement === null ? [] : [{ statement, frameBase }]
    );

    let size = JSON.stringify(variables).length;
    const heap: Record<string, HeapEntry> = Object.create(null);
    const seen = new Map<string, { entry: HeapEntry; json: string }>();
    Object.entries(
      readHeap(debug, callFrames, view, allocationOf, checkTime, {
        roots: shownRoots(),
        onShown: remember,
        onOverlapped: forget,
      })
    ).forEach(([address, entry]) => {
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
    });
    if (recordedSize + size > sizeLimit) throw new LimitReached({ sizeLimit });
    recordedSize += size;
    previousHeap = seen;

    return {
      function: call.function,
      line: call.line,
      depth: calls.indexOf(call),
      output: '',
      variables,
      heap,
    };
  };

  /** `again` adds a step even on the line of the call's latest step. */
  const addStep = (call: Call, memory: () => DataView, again = false) => {
    if (call.steppedLine === call.line && !again) return;
    const step = readStep(call, memory);
    if (!step) return;
    steps.push(step);
    call.steppedLine = call.line;
    call.returnedTo = false;
  };

  /** Reads the program's memory, for what's shown once it has stopped. */
  let latestMemory: (() => DataView) | null = null;

  let end: RunEnd;
  try {
    const { exitCode } = await runWasi(wasm, {
      input,
      onOutput: (text) => {
        const kept = limitOutput(text);
        const last = steps.at(-1);
        if (last) last.output += kept;
        else outputBeforeFirstStep += kept;
      },
      onTrace: (event, memory) => {
        latestMemory = memory;
        if (event.type === 'enter') {
          const name = debug.functions[event.function] ?? `function ${event.function}`;
          calls.push({
            function: name,
            statement: null,
            line: null,
            frameBase: 0,
            steppedLine: null,
            returnedTo: false,
          });
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
          if (caller) caller.returnedTo = true;
        } else if (event.type === 'allocated') {
          if (event.pointer !== 0) allocations.set(unsigned(event.pointer), unsigned(event.size));
          starts = null;
        } else if (event.type === 'freed') {
          allocations.delete(unsigned(event.pointer));
          shown.delete(unsigned(event.pointer));
          starts = null;
        } else if (event.pointer !== 0) {
          const old = unsigned(event.old);
          const start = unsigned(event.pointer);
          const size = unsigned(event.size);
          allocations.delete(old);
          const structs = shown.get(old);
          if (structs && start === old) {
            // Resized in place: forget the structs no longer wholly inside it,
            // so they aren't drawn from that memory once it's reused.
            structs.forEach((type, address) => {
              if (address + debug.types[type].size > start + size) structs.delete(address);
            });
          } else {
            // Moved, its structs are now wherever the variables reach them.
            shown.delete(old);
          }
          allocations.set(start, size);
          starts = null;
        }
      },
    });
    end = { exitCode };
  } catch (error) {
    if (error instanceof LimitReached) end = error.end;
    else if (error === WAITING_FOR_INPUT) {
      end = { waitingForInput: true };
      // Paused in a call with no step since a call it made returned: say
      // where, without adding a step (see RunEnd).
      const call = calls.at(-1);
      if (call?.returnedTo && latestMemory) {
        try {
          const at = readStep(call, latestMemory);
          if (at) end = { waitingForInput: true, at };
        } catch {
          // Past a limit, the last step stands for where it is.
        }
      }
    } else {
      end = { crashed: error instanceof Error ? error.message : String(error) };
      // A crash in a call with no step since a call it made returned, such as
      // `a / zero()`, would otherwise show on the returned call's last line.
      const call = calls.at(-1);
      if (call?.returnedTo && latestMemory) {
        try {
          addStep(call, latestMemory, true);
        } catch {
          // Past a limit, the steps so far are kept.
        }
      }
    }
  }

  return {
    steps,
    outputBeforeFirstStep,
    end,
    types: structDeclarations(debug),
  };
};
