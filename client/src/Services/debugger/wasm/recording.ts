import { createAllocations } from './allocations';
import { createHeapSharing } from './heapSharing';
import { createOutputLimit } from './outputLimit';
import { createRememberedStructs } from './rememberedStructs';
import { runWasi, WAITING_FOR_INPUT } from './run';
import { readDebugSection, structDeclarations, TypeDeclaration } from './debugSection';
import { HeapEntry, readHeap } from './heap';
import { readVariables, Variable } from './variables';

export type { HeapEntry } from './heap';
export type { TypeDeclaration } from './debugSection';
export type { Variable } from './variables';

/**
 * How many statements a program may run before it is stopped. Repeats that
 * don't become steps count too, so a loop that only repeats one line still
 * stops.
 */
export const STATEMENT_LIMIT = 100_000;

export const TIME_LIMIT_MS = 10_000;

/** Roughly how many bytes of snapshots a recording may hold, measured as JSON. */
export const RECORDING_SIZE_LIMIT_BYTES = 50_000_000;

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
   * The structs on the heap that any frame's variables reach, and those
   * remembered from an earlier step that aren't freed yet, by address. An entry that didn't
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
  outputBeforeFirstStep: string;
  end: RunEnd;
  types: TypeDeclaration[];
};

/** wasm passes pointers and sizes as signed 32-bit numbers. */
const unsigned = (value: number) => (value < 0 ? value + 2 ** 32 : value);

class LimitReached extends Error {
  constructor(readonly end: RunEnd) {
    super();
  }
}

type CallStage =
  | { stage: 'entered' }
  | { stage: 'stepped'; line: number }
  | { stage: 'returnedFromCallee'; line: number | null };

type Call = {
  function: string;
  at: { statement: number; line: number | null; frameBase: number } | null;
  stage: CallStage;
};

const steppedLine = (stage: CallStage) => (stage.stage === 'entered' ? null : stage.line);

/**
 * Runs an instrumented program to the end and records its steps. A step is
 * one statement: a repeat of the same line in the same call is skipped, even
 * after a call made from that line returns. Returning from a call isn't a
 * step. A program that runs too many statements, or for too long, is stopped,
 * and its steps up to then are kept.
 */
export const recordRun = async (
  wasm: Uint8Array<ArrayBuffer>,
  {
    statementLimit = STATEMENT_LIMIT,
    timeLimitMs = TIME_LIMIT_MS,
    sizeLimit = RECORDING_SIZE_LIMIT_BYTES,
    input = { text: '', eof: false },
  }: {
    statementLimit?: number;
    timeLimitMs?: number;
    sizeLimit?: number;
    /** stdin: the text typed so far, and whether end-of-file was sent. */
    input?: { text: string; eof: boolean };
  } = {}
): Promise<Recording> => {
  const debug = readDebugSection(await WebAssembly.compile(wasm));
  const steps: Step[] = [];
  const calls: Call[] = [];
  let outputBeforeFirstStep = '';
  let statementsRun = 0;
  const limitOutput = createOutputLimit();
  const deadline = performance.now() + timeLimitMs;

  const checkTime = () => {
    if (performance.now() > deadline) throw new LimitReached({ timeLimit: timeLimitMs });
  };

  const { allocationOf, ...allocations } = createAllocations();
  const remembered = createRememberedStructs(debug.types, allocationOf);
  const shareUnchanged = createHeapSharing();
  let recordedSize = 0;

  const captureStepWithinLimits = (call: Call, memory: () => DataView): Step | null => {
    if (call.at === null || call.at.line === null) return null;
    const view = memory();
    const variables = readVariables(debug, call.at.statement, call.at.frameBase, view);
    const callFrames = calls.flatMap(({ at }) => (at === null ? [] : [at]));
    const { heap, size: heapSize } = shareUnchanged(
      readHeap(debug, callFrames, view, allocationOf, checkTime, {
        roots: remembered.roots(),
        onRemembered: remembered.remember,
        onOverlapped: remembered.forget,
      })
    );
    const size = JSON.stringify(variables).length + heapSize;
    if (recordedSize + size > sizeLimit) throw new LimitReached({ sizeLimit });
    recordedSize += size;

    return {
      function: call.function,
      line: call.at.line,
      depth: calls.indexOf(call),
      output: '',
      variables,
      heap,
    };
  };

  const addStep = (call: Call, memory: () => DataView) => {
    if (steppedLine(call.stage) === (call.at?.line ?? null)) return;
    const step = captureStepWithinLimits(call, memory);
    if (!step) return;
    steps.push(step);
    call.stage = { stage: 'stepped', line: step.line };
  };

  let latestMemory: (() => DataView) | null = null;

  const captureStepAfterReturn = (): Step | null => {
    const call = calls.at(-1);
    if (call?.stage.stage !== 'returnedFromCallee' || !latestMemory) return null;
    try {
      return captureStepWithinLimits(call, latestMemory);
    } catch (error) {
      if (error instanceof LimitReached || error instanceof RangeError) return null;
      throw error;
    }
  };

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
          calls.push({ function: name, at: null, stage: { stage: 'entered' } });
        } else if (event.type === 'line') {
          statementsRun += 1;
          if (statementsRun > statementLimit) throw new LimitReached({ stepLimit: statementLimit });
          checkTime();
          const call = calls.at(-1);
          if (!call) return;
          call.at = {
            statement: event.statement,
            line: debug.statements[event.statement]?.line ?? null,
            frameBase: event.frameBase,
          };
          addStep(call, memory);
        } else if (event.type === 'exit') {
          calls.pop();
          const caller = calls.at(-1);
          if (caller)
            caller.stage = { stage: 'returnedFromCallee', line: steppedLine(caller.stage) };
        } else if (event.type === 'allocated') {
          if (event.pointer !== 0) allocations.add(unsigned(event.pointer), unsigned(event.size));
        } else if (event.type === 'freed') {
          allocations.remove(unsigned(event.pointer));
          remembered.freed(unsigned(event.pointer));
        } else if (event.pointer !== 0) {
          const old = unsigned(event.old);
          const start = unsigned(event.pointer);
          const size = unsigned(event.size);
          allocations.remove(old);
          remembered.reallocated(old, start, size);
          allocations.add(start, size);
        }
      },
    });
    end = { exitCode };
  } catch (error) {
    if (error instanceof LimitReached) end = error.end;
    else if (error === WAITING_FOR_INPUT) {
      const at = captureStepAfterReturn();
      end = at ? { waitingForInput: true, at } : { waitingForInput: true };
    } else {
      end = { crashed: error instanceof Error ? error.message : String(error) };
      const at = captureStepAfterReturn();
      if (at) steps.push(at);
    }
  }

  return {
    steps,
    outputBeforeFirstStep,
    end,
    types: structDeclarations(debug),
  };
};
