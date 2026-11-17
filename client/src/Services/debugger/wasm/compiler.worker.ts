import { compileC } from './compile';

export type CompileRequest = { id: number; fileName: string; source: string };

// The page's TypeScript setup has no Web Worker types, so describe the little
// of the worker scope this file uses.
const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<CompileRequest>) => void;
  postMessage: (message: unknown, transfer: Transferable[]) => void;
};

scope.onmessage = async ({ data: { id, fileName, source } }) => {
  const result = await compileC(fileName, source);
  scope.postMessage({ id, result }, result.ok ? [result.wasm.buffer] : []);
};
