import { useCallback, useEffect } from 'react';
import { BackendState, INITIAL_BACKEND_STATE } from '../visualiser-debugger/Types/backendType';
import { useDebuggerStore } from './debugger/debuggerStore';
import { buildDebuggerEvents } from './debugger/buildDebuggerEvents';
import { useCompilerStatusStore } from './debugger/compilerStatusStore';
import { useGlobalStore } from '../visualiser-debugger/Store/globalStateStore';
import { useUserFsStateStore } from '../visualiser-debugger/Store/userFsStateStore';
import { useFrontendStateStore } from '../visualiser-debugger/Store/frontendStateStore';
import {
  DEFAULT_MESSAGE_DURATION,
  useToastStateStore,
} from '../visualiser-debugger/Store/toastStateStore';
import { useQueue } from './useQueue';

const addToTimeline = (state: BackendState) => {
  const { parser, userAnnotation } = useGlobalStore.getState().visualizer;
  useFrontendStateStore
    .getState()
    .pushOrReplaceFrontendState(state, parser.parseState(state, userAnnotation));
};

export const useDebugger = () => {
  const {
    updateCurrFocusedTab,
    updateNextFrame,
    updateTypeDeclaration,
    clearTypeDeclarations,
    clearUserAnnotation,
    resetConsoleChunks,
    appendConsoleChunks,
  } = useGlobalStore();

  const { setActive, clearFrontendState } = useFrontendStateStore();
  const debuggerClient = useDebuggerStore((state) => state.debuggerClient);
  const { setToastMessage } = useToastStateStore();
  const setCompilerStatus = useCompilerStatusStore((state) => state.setStatus);
  const queue = useQueue();

  useEffect(() => {
    if (!debuggerClient) {
      return;
    }

    const events = buildDebuggerEvents({
      setActive,
      updateNextFrame,
      addToTimeline,
      updateTypeDeclaration,
      appendConsoleChunks,
      updateCurrFocusedTab,
      setMessage: setToastMessage,
      setCompilerStatus,
    });

    debuggerClient.setEvents(events);
  }, [
    debuggerClient,
    setActive,
    updateNextFrame,
    updateTypeDeclaration,
    appendConsoleChunks,
    updateCurrFocusedTab,
    setToastMessage,
    setCompilerStatus,
  ]);

  const resetDebugSession = useCallback(() => {
    updateNextFrame(INITIAL_BACKEND_STATE);
    clearFrontendState();
    setActive(false);
    clearTypeDeclarations();
    clearUserAnnotation();
    resetConsoleChunks();
  }, [
    updateNextFrame,
    clearFrontendState,
    setActive,
    clearTypeDeclarations,
    clearUserAnnotation,
    resetConsoleChunks,
  ]);

  const sendCode = useCallback(() => {
    if (!debuggerClient) return;

    resetDebugSession();

    const { fileSystem, currFocusFilePath } = useUserFsStateStore.getState();
    const file = fileSystem.getFileFromPath(currFocusFilePath);

    if (!file || file.path === 'root') {
      setToastMessage({
        content: 'No file being selected',
        colorTheme: 'warning',
        durationMs: DEFAULT_MESSAGE_DURATION,
      });
      return;
    }

    debuggerClient.start({ name: file.name, code: file.data });
  }, [debuggerClient, resetDebugSession, setToastMessage]);

  const queueStep = useCallback(() => {
    if (!debuggerClient) return Promise.resolve(false);

    return queue(() => debuggerClient.step());
  }, [debuggerClient, queue]);

  const bulkSendNextStates = useCallback(
    async (count: number) => {
      const results = await Promise.all(Array.from({ length: count }, () => queueStep()));
      return results.filter(Boolean).length;
    },
    [queueStep]
  );

  return {
    resetConsoleChunks,
    appendConsoleChunks,
    sendCode,
    getNextState: queueStep,
    bulkSendNextStates,
    resetDebugSession,
  };
};
