import { useState } from 'react';
import { useDebuggerStore } from '@/Services/debugger/debuggerStore';
import { useFrontendStateStore } from '@/visualiser-debugger/Store/frontendStateStore';
import { useGlobalStore } from '@/visualiser-debugger/Store/globalStateStore';

function useCursor(content: string, clearInput: () => void, scrollToBottom: () => void) {
  const activeDebugger = useDebuggerStore((state) => state.activeDebugger);
  const appendConsoleChunk = useGlobalStore((state) => state.appendConsoleChunks);
  const setActive = useFrontendStateStore((state) => state.setActive);

  const [cursorOffsetFromEnd, setCursorOffsetFromEnd] = useState(0);
  const [isBlinkPaused, setIsBlinkPaused] = useState(true);

  let timeoutRef: NodeJS.Timeout;

  function pauseWithTimeout() {
    setIsBlinkPaused(true);

    clearTimeout(timeoutRef);

    timeoutRef = setTimeout(() => {
      setIsBlinkPaused(false);
    }, 500);
  }

  function handleKeyAction(key: string, ctrlKey: boolean) {
    switch (key) {
      case 'ArrowLeft':
        if (content.length > cursorOffsetFromEnd) {
          setCursorOffsetFromEnd(cursorOffsetFromEnd + 1);
        }
        break;
      case 'ArrowRight':
        if (cursorOffsetFromEnd > 0) {
          setCursorOffsetFromEnd(cursorOffsetFromEnd - 1);
        }
        break;
      case 'Delete':
        if (content.length >= cursorOffsetFromEnd) {
          setCursorOffsetFromEnd(cursorOffsetFromEnd - 1);
        }
        break;
      case 'Home':
      case 'ArrowUp':
        setCursorOffsetFromEnd(content.length);
        break;
      case 'End':
      case 'ArrowDown':
        setCursorOffsetFromEnd(0);
        break;
      case 'Enter':
        if (!activeDebugger) return;
        activeDebugger.sendStdin(content);
        appendConsoleChunk(`${content}\n`);
        clearInput();
        scrollToBottom();
        break;
      default:
        break;
    }
    if (!activeDebugger) return;

    if (ctrlKey && key === 'd') {
      activeDebugger.sendEOF();
    }

    if (ctrlKey && key === 'c') {
      activeDebugger.interrupt();
      setActive(false);
    }
  }

  function handleOnFocus() {
    setIsBlinkPaused(false);
  }

  function handleOnBlur() {
    setIsBlinkPaused(true);
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    const { key, ctrlKey } = event;
    pauseWithTimeout();

    handleKeyAction(key, ctrlKey);
  }

  return {
    handleOnFocus,
    handleOnBlur,
    handleKeyDown,
    shifts: cursorOffsetFromEnd,
    paused: isBlinkPaused,
  };
}

export default useCursor;
