import { Debugger, DebuggerEvents, SourceFile } from './types';
import { Compiler } from './wasm/compiler';
import { createWorkerCompiler } from './wasm/workerCompiler';

/**
 * The debugger that runs entirely in the browser. It compiles programs, but
 * doesn't run or step them yet (see docs/debugger-rewrite.md).
 */
export class WasmDebugger implements Debugger {
  readonly kind = 'wasm';

  private events: DebuggerEvents | null = null;

  constructor(private readonly compiler: Compiler = createWorkerCompiler()) {}

  setEvents(events: DebuggerEvents) {
    this.events = events;
  }

  start({ name, code }: SourceFile) {
    this.compiler.compile(name, code).then((result) => {
      if (result.ok) this.events?.sessionStarted();
      else this.events?.compileError([result.errors]);
    });
  }

  step() {
    // Running and stepping arrive in checkpoints 1c and 2.
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
