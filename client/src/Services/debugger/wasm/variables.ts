import type { DebugSection } from './debugSection';
import { formatAddress, readValue, Value } from './values';

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
    variables[name] = { addr: formatAddress(address), typeName: debug.types[type].name, value };
  });
  return variables;
};
