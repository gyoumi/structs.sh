import { connectToGdb, GdbDebugger } from './gdbDebugger';
import { Debugger, DebuggerKind } from './types';
import { WasmDebugger } from './wasmDebugger';

/** The in-browser debugger, unless `?debugger=gdb` asks for GDB on the server. */
export const debuggerKindFromSearch = (search: string): DebuggerKind =>
  new URLSearchParams(search).get('debugger') === 'gdb' ? 'gdb' : 'wasm';

export const createDebugger = (kind: DebuggerKind): Debugger =>
  kind === 'wasm' ? new WasmDebugger() : new GdbDebugger(connectToGdb());
