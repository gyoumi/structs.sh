import { answerCompilerMessage, CompileRequest, LoadRequest } from './compileRequest';

// The page's TypeScript setup has no Web Worker types, so describe the little
// of the worker scope this file uses.
const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<CompileRequest | LoadRequest>) => void;
  postMessage: (message: unknown, transfer: Transferable[]) => void;
};

scope.onmessage = async ({ data }) => {
  await answerCompilerMessage(data, (message) =>
    scope.postMessage(
      message,
      'result' in message && message.result.ok ? [message.result.wasm.buffer] : []
    )
  );
};
