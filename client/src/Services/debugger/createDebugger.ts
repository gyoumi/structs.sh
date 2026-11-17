import { connectToGdb, GdbDebugger } from './gdbDebugger';
import { Debugger, DebuggerKind } from './types';
import { WasmDebugger } from './wasmDebugger';

/** `?debugger=wasm` picks the in-browser debugger. Anything else uses GDB. */
export const debuggerKindFromSearch = (search: string): DebuggerKind =>
  new URLSearchParams(search).get('debugger') === 'wasm' ? 'wasm' : 'gdb';

export const createDebugger = (kind: DebuggerKind): Debugger =>
  kind === 'wasm' ? new WasmDebugger() : new GdbDebugger(connectToGdb());
