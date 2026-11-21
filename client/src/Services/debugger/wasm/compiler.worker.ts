import { answerCompilerMessage, CompileRequest, LoadRequest } from './compileRequest';

globalThis.onmessage = async ({ data }: MessageEvent<CompileRequest | LoadRequest>) => {
  await answerCompilerMessage(data, (message) =>
    globalThis.postMessage(message, {
      transfer: 'result' in message && message.result.ok ? [message.result.wasm.buffer] : [],
    })
  );
};
