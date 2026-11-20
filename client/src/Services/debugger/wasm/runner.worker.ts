import { answerRunRequest, RunRequest } from './runRequest';

globalThis.onmessage = async ({ data }: MessageEvent<RunRequest>) => {
  await answerRunRequest(data, (message) => globalThis.postMessage(message));
};

globalThis.postMessage({ type: 'ready' });
