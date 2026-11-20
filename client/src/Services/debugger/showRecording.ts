import { BackendState } from '@/visualiser-debugger/Types/backendType';
import { SourceFile } from './types';
import { Recording, RunEnd, Step, TIME_LIMIT_MS } from './wasm/recording';
import { RecordResult } from './wasm/workerRunner';

const TOO_LONG = `The program was stopped because it ran for too long (over ${TIME_LIMIT_MS / 1000} seconds).`;

/** What to tell the student once stepping reaches the end of a recording. */
export const describeEnd = (end: RunEnd) => {
  if ('exitCode' in end) return `\nThe program finished with exit code ${end.exitCode}.\n`;
  if ('crashed' in end) return `\nThe program crashed: ${end.crashed}\n`;
  if ('stepLimit' in end) {
    return `\nThe program was stopped after ${end.stepLimit.toLocaleString('en')} steps, the most the debugger records.\n`;
  }
  if ('sizeLimit' in end) {
    return '\nThe program was stopped because its memory changed too much for the debugger to record every step.\n';
  }
  return `\n${TOO_LONG}\n`;
};

/** What to tell the student when a program couldn't be recorded at all. */
export const describeFailure = (result: Exclude<RecordResult, { recording: Recording }>) => {
  if ('timedOut' in result) return `\n${TOO_LONG}\n`;
  if ('stopped' in result) return '\nThe program was stopped.\n';
  return `\nThe program could not be run: ${result.error}\n`;
};

/**
 * The page's view of one step.
 *
 * stack_data and heap_data are in the format the GDB debugger used to send
 * (`{ addr, typeName, value }`), which is what the page reads, though
 * BackendState's types describe an older one.
 */
export const stateAt = (file: SourceFile, step: Step): BackendState => ({
  frame_info: {
    file: file.name,
    line: file.code.split('\n')[step.line - 1] ?? '',
    line_num: step.line,
    function: step.function,
  },
  stack_data: step.variables as unknown as BackendState['stack_data'],
  heap_data: step.heap as unknown as BackendState['heap_data'],
});
