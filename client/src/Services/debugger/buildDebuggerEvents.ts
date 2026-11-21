import { ProgramState } from '@/visualiser-debugger/Types/programState';
import { DEFAULT_MESSAGE_DURATION } from '@/visualiser-debugger/Store/toastStateStore';
import { DebuggerEvents } from './types';
import type { CompilerStatus } from './wasm/compilerTypes';
import type { TypeDeclaration } from './wasm/debugSection';

export type DebuggerEventHandlers = {
  setMessage: (msg: { content: string; colorTheme: string; durationMs: number }) => void;
  setActive: (active: boolean) => void;
  setLatestProgramState: (state: ProgramState) => void;
  addToTimeline: (state: ProgramState) => void;
  addTypeDeclaration: (type: TypeDeclaration) => void;
  appendConsoleChunks: (chunks: string[]) => void;
  updateCurrFocusedTab: (tab: string) => void;
  setCompilerStatus: (status: CompilerStatus) => void;
};

export const buildDebuggerEvents = ({
  setMessage,
  setActive,
  setLatestProgramState,
  addToTimeline,
  addTypeDeclaration,
  appendConsoleChunks,
  updateCurrFocusedTab,
  setCompilerStatus,
}: DebuggerEventHandlers): DebuggerEvents => ({
  sessionStarted: () => {
    setMessage({
      content: 'Debug session started.',
      colorTheme: 'info',
      durationMs: DEFAULT_MESSAGE_DURATION,
    });
    setActive(true);
  },

  sessionEnded: () => {
    setMessage({
      content: 'Debug session ended.',
      colorTheme: 'info',
      durationMs: DEFAULT_MESSAGE_DURATION,
    });
    setActive(false);
  },

  state: (state: ProgramState) => {
    setLatestProgramState(state);
    addToTimeline(state);
  },

  typeDeclaration: addTypeDeclaration,

  output: (text: string) => {
    appendConsoleChunks([...text]);
  },

  compilerStatus: setCompilerStatus,

  compileError: (errors: string[]) => {
    appendConsoleChunks([...errors]);
    updateCurrFocusedTab('2');
  },
});
