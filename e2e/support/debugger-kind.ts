/**
 * Which debugger the suite runs against, from E2E_DEBUGGER: `wasm` (the
 * default, in the browser) or `gdb` (on the server, until it's deleted).
 * Each has its own list in known-failures/.
 */
export const debuggerKind = (() => {
  const kind = process.env.E2E_DEBUGGER ?? 'wasm';
  if (kind !== 'gdb' && kind !== 'wasm') {
    throw new Error(`E2E_DEBUGGER must be "gdb" or "wasm", not "${kind}"`);
  }
  return kind;
})();
