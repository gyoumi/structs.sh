/**
 * Reads a program's variables from its memory, using the `structs.debug`
 * section the instrumenter writes (see instrumenter/src/dwarf/mod.rs). Values and
 * type names come out the way the GDB debugger sends them, so the page shows
 * both the same way.
 */
import { DebugSection } from './debugSection';
import { hex, readValue, Value } from './values';

export type { DebugSection, DebugType, TypeDeclaration } from './debugSection';
export { readDebugSection, structDeclarations } from './debugSection';
export type { Value } from './values';
export { hex, readValue } from './values';
export type { Allocation, Frame, HeapEntry, HeapField, ShownStructs } from './heap';
export { readHeap } from './heap';

/** A variable as the GDB debugger sends it in `stack_data`. */
export type Variable = { addr: string; typeName: string; value: Value };

/**
 * The variables in scope at a statement, read from the call whose frame base
 * is `frameBase`. A variable that can't be read (an address past the end of
 * memory, which a broken frame could give) has the value null.
 */
export const readVariables = (
  debug: DebugSection,
  statement: number,
  frameBase: number,
  memory: DataView
): Record<string, Variable> => {
  // No prototype, so a variable called `constructor` is still found.
  const variables: Record<string, Variable> = Object.create(null);
  (debug.statements[statement]?.variables ?? []).forEach(({ name, type, offset }) => {
    // An inner variable hides an outer one with the same name, as in C.
    if (name in variables) return;
    const address = frameBase + offset;
    let value: Value;
    try {
      value = readValue(debug.types, type, memory, address);
    } catch {
      value = null;
    }
    variables[name] = { addr: hex(address), typeName: debug.types[type].name, value };
  });
  return variables;
};
