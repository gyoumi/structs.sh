import { answerRunRequest, RunRequest } from './runRequest';

// The page's TypeScript setup has no Web Worker types, so describe the little
// of the worker scope this file uses.
const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<RunRequest>) => void;
  postMessage: (message: unknown) => void;
};

scope.onmessage = async ({ data }) => {
  await answerRunRequest(data, (message) => scope.postMessage(message));
};

// Its script and imports have loaded, so it can run with the network off.
scope.postMessage({ type: 'ready' });
