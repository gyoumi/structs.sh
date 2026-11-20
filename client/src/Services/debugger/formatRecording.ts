import { ProgramState } from '@/visualiser-debugger/Types/programState';
import { SourceFile } from './types';
import { Recording, RunEnd, Step, TIME_LIMIT_MS } from './wasm/recording';
import { RecordResult } from './wasm/workerRunner';

const TOO_LONG = `The program was stopped because it ran for too long (over ${TIME_LIMIT_MS / 1000} seconds).`;

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

export const describeFailure = (result: Exclude<RecordResult, { recording: Recording }>) => {
  if ('timedOut' in result) return `\n${TOO_LONG}\n`;
  if ('stopped' in result) return '\nThe program was stopped.\n';
  return `\nThe program could not be run: ${result.error}\n`;
};

export const toProgramState = (file: SourceFile, step: Step): ProgramState => ({
  frame_info: {
    file: file.name,
    line: file.code.split('\n')[step.line - 1] ?? '',
    line_num: step.line,
    function: step.function,
  },
  stack_data: step.variables,
  heap_data: step.heap,
});
