import { BackendState, BackendTypeDeclaration } from '@/visualiser-debugger/Types/backendType';
import { DEFAULT_MESSAGE_DURATION } from '@/visualiser-debugger/Store/toastStateStore';
import { DebuggerEvents } from './types';
import type { CompilerStatus } from './wasm/compiler';

type Page = {
  setMessage: (msg: { content: string; colorTheme: string; durationMs: number }) => void;
  setActive: (active: boolean) => void;
  updateNextFrame: (state: BackendState) => void;
  updateTypeDeclaration: (type: BackendTypeDeclaration) => void;
  appendConsoleChunks: (chunks: string[]) => void;
  updateCurrFocusedTab: (tab: string) => void;
  setCompilerStatus: (status: CompilerStatus) => void;
};

/** Connects what a debugger reports to the page's stores. */
export const buildDebuggerEvents = ({
  setMessage,
  setActive,
  updateNextFrame,
  updateTypeDeclaration,
  appendConsoleChunks,
  updateCurrFocusedTab,
  setCompilerStatus,
}: Page): DebuggerEvents => ({
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

  state: (state: BackendState) => {
    updateNextFrame(state);
  },

  typeDeclaration: (type: BackendTypeDeclaration) => {
    if (type.typeName !== 'size_t') {
      updateTypeDeclaration(type);
    }
  },

  output: (text: string) => {
    appendConsoleChunks([...text]);
  },

  compilerStatus: setCompilerStatus,

  compileError: (errors: string[]) => {
    appendConsoleChunks([...errors]);
    updateCurrFocusedTab('2');
  },
});
