import { answerCompileRequest, CompileRequest } from './compileRequest';

// The page's TypeScript setup has no Web Worker types, so describe the little
// of the worker scope this file uses.
const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<CompileRequest>) => void;
  postMessage: (message: unknown, transfer: Transferable[]) => void;
};

scope.onmessage = async ({ data }) => {
  const response = await answerCompileRequest(data);
  scope.postMessage(response, response.result.ok ? [response.result.wasm.buffer] : []);
};
