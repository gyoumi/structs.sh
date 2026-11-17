/**
 * Which debugger the suite runs against, from E2E_DEBUGGER: `gdb` (the
 * default, on the server) or `wasm` (in the browser, being built). Each has
 * its own list in known-failures/.
 */
export const debuggerKind = (() => {
  const kind = process.env.E2E_DEBUGGER ?? 'gdb';
  if (kind !== 'gdb' && kind !== 'wasm') {
    throw new Error(`E2E_DEBUGGER must be "gdb" or "wasm", not "${kind}"`);
  }
  return kind;
})();
