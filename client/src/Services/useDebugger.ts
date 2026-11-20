import { useCallback, useEffect } from 'react';
import { ProgramState, INITIAL_PROGRAM_STATE } from '../visualiser-debugger/Types/programState';
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

const addToTimeline = (state: ProgramState) => {
  const { parser, userAnnotation } = useGlobalStore.getState().visualizer;
  useFrontendStateStore
    .getState()
    .pushOrReplaceLatestStep(state, parser.parseState(state, userAnnotation));
};

export const useDebugger = () => {
  const {
    updateCurrFocusedTab,
    setLatestProgramState,
    addTypeDeclaration,
    clearTypeDeclarations,
    clearUserAnnotation,
    resetConsoleChunks,
    appendConsoleChunks,
  } = useGlobalStore();

  const { setActive, resetTimeline } = useFrontendStateStore();
  const activeDebugger = useDebuggerStore((state) => state.activeDebugger);
  const { setToastMessage } = useToastStateStore();
  const setCompilerStatus = useCompilerStatusStore((state) => state.setStatus);
  const queue = useQueue();

  useEffect(() => {
    if (!activeDebugger) {
      return;
    }

    const events = buildDebuggerEvents({
      setActive,
      setLatestProgramState,
      addToTimeline,
      addTypeDeclaration,
      appendConsoleChunks,
      updateCurrFocusedTab,
      setMessage: setToastMessage,
      setCompilerStatus,
    });

    activeDebugger.setEvents(events);
  }, [
    activeDebugger,
    setActive,
    setLatestProgramState,
    addTypeDeclaration,
    appendConsoleChunks,
    updateCurrFocusedTab,
    setToastMessage,
    setCompilerStatus,
  ]);

  const resetDebugSession = useCallback(() => {
    setLatestProgramState(INITIAL_PROGRAM_STATE);
    resetTimeline();
    setActive(false);
    clearTypeDeclarations();
    clearUserAnnotation();
    resetConsoleChunks();
  }, [
    setLatestProgramState,
    resetTimeline,
    setActive,
    clearTypeDeclarations,
    clearUserAnnotation,
    resetConsoleChunks,
  ]);

  const startDebugging = useCallback(() => {
    if (!activeDebugger) return;

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

    activeDebugger.start({ name: file.name, code: file.data });
  }, [activeDebugger, resetDebugSession, setToastMessage]);

  const requestNextStep = useCallback(() => {
    if (!activeDebugger) return Promise.resolve(false);

    return queue(() => activeDebugger.step());
  }, [activeDebugger, queue]);

  const requestSteps = useCallback(
    async (count: number) => {
      const results = await Promise.all(Array.from({ length: count }, () => requestNextStep()));
      return results.filter(Boolean).length;
    },
    [requestNextStep]
  );

  return {
    resetConsoleChunks,
    appendConsoleChunks,
    startDebugging,
    requestNextStep,
    requestSteps,
    resetDebugSession,
  };
};
