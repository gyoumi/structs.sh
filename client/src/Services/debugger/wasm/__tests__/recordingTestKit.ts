import { readFileSync } from 'node:fs';
import { compileAndInstrument } from '../instrumenter';
import { HeapEntry, recordRun, Recording, Step, Variable } from '../recording';

// Helpers for the wasm/recording.*.test.ts files. Recording needs the instrumenter
// built first: `pnpm run instrumenter` from the repo root.

/** Loading clang (about 100 MB of wasm) takes a few seconds the first time. */
export const CLANG_TIMEOUT = 60_000;

/** An int whose bytes are all 0xAA, as an uninitialised local holds. */
export const UNINITIALISED_INT = -1431655766;

/** A program from e2e/programs, the ones the e2e suite uses. */
export const program = (name: string) =>
  readFileSync(new URL(`../../../../../../e2e/programs/${name}`, import.meta.url), 'utf8');

/** A program from ./fixtures. */
export const fixture = (name: string) =>
  readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

/** Compiles, instruments and records a program, throwing its compile errors. */
export const record = async (
  name: string,
  source: string,
  options?: Parameters<typeof recordRun>[1]
): Promise<Recording> => {
  const compiled = await compileAndInstrument(name, source);
  if (!compiled.ok) throw new Error(compiled.errors);
  return recordRun(compiled.wasm, options);
};

/** Steps as "function:line", the way a user would see them. */
export const stepsOf = (recording: Recording) =>
  recording.steps.map((step) => `${step.function}:${step.line}`);

/** "step N function:line", for messages. */
export const describeStep = (steps: Step[], index: number) =>
  `step ${index + 1} ${steps[index].function}:${steps[index].line}`;

/** What the program printed during its recorded steps, without what it printed before the first. */
export const stepOutput = (recording: Recording) =>
  recording.steps.map((step) => step.output).join('');

/** Everything the program printed, before and during its steps. */
export const outputOf = (recording: Recording) =>
  recording.outputBeforeFirstStep + recording.steps.map((step) => step.output).join('');

/** The variables' names and types, in the order the page lists them. */
export const declarations = (variables: Record<string, Pick<Variable, 'typeName'> | undefined>) =>
  Object.entries(variables).map(([name, variable]) => `${variable?.typeName} ${name}`);

/** A program with `struct node { int value; struct node *next; }` whose main is `body`. */
export const nodeProgram = (body: string) =>
  [
    '#include <stdlib.h>',
    '#include <string.h>',
    'struct node { int value; struct node *next; };',
    'int main(void) {',
    body,
    '    return 0;',
    '}',
  ].join('\n');

/** A heap entry's fields as plain values, nested structs included. */
export const fieldValues = (entry: HeapEntry) =>
  Object.fromEntries(Object.entries(entry.value).map(([field, f]) => [field, f.value]));

/** A heap entry as "<type> at <address> {fields}", for messages. */
export const describeEntry = (entry: HeapEntry) =>
  `${entry.typeName} at ${entry.addr} ${JSON.stringify(fieldValues(entry))}`;

/** Every entry on a step's heap, for messages. */
export const describeHeap = (step: Step) =>
  Object.values(step.heap).map(describeEntry).join(', ') || 'nothing';

/** The heap's entries at the first step on `line`, as "<type> {fields}". */
export const heapAt = (recording: Recording, line: number) => {
  const step = recording.steps.find((s) => s.line === line);
  if (!step) throw new Error(`no step on line ${line}; steps: ${stepsOf(recording).join(', ')}`);
  return Object.values(step.heap).map(
    (entry) => `${entry.typeName} ${JSON.stringify(fieldValues(entry))}`
  );
};

/** The variables at the first step on `line`, failing with the steps taken if there is none. */
export const variablesAt = (recording: Recording, line: number) => {
  const step = recording.steps.find((s) => s.line === line);
  if (!step) throw new Error(`no step on line ${line}; steps: ${stepsOf(recording).join(', ')}`);
  return step.variables;
};
