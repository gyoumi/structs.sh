import { Debugger } from './types';

/**
 * The debugger that will run entirely in the browser. It does nothing yet:
 * compiling arrives in checkpoint 1b (see docs/debugger-rewrite.md).
 */
export class WasmDebugger implements Debugger {
  readonly kind = 'wasm';

  setEvents() {
    // Nothing is reported yet.
  }

  start() {
    // Compiling arrives in checkpoint 1b.
  }

  step() {
    return Promise.resolve(false);
  }

  sendStdin() {
    // Input arrives in checkpoint 3.
  }

  sendEOF() {
    // Input arrives in checkpoint 3.
  }

  interrupt() {
    // Nothing runs yet.
  }

  close() {
    // Nothing to close.
  }
}
