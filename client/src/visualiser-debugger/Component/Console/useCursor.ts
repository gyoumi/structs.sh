import { useState } from 'react';
import { useDebuggerStore } from '@/Services/debugger/debuggerStore';
import { useFrontendStateStore } from '@/visualiser-debugger/Store/frontendStateStore';
import { useGlobalStore } from '@/visualiser-debugger/Store/globalStateStore';

function useCursor(
  content: string,
  clearInput: () => void,
  scrollToBottom: () => void,
  // TODO: Remove this after clarification on the TODO below
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isCompiled: boolean
) {
  const debuggerClient = useDebuggerStore((state) => state.debuggerClient);
  const appendConsoleChunk = useGlobalStore((state) => state.appendConsoleChunks);
  const setActive = useFrontendStateStore((state) => state.setActive);

  const [shifts, setShifts] = useState(0);
  const [paused, setPaused] = useState(true);
  const [isCtrlPressed, setIsCtrlPressed] = useState(false);

  // const removeStructsPrefix = (currInput: string) => {
  //   return currInput.split(' ').slice(2).join(' ');
  // };

  let timeoutRef: NodeJS.Timeout;

  function pauseWithTimeout() {
    setPaused(true);

    clearTimeout(timeoutRef);

    timeoutRef = setTimeout(() => {
      setPaused(false);
    }, 500);
  }

  function updateShifts(key: string) {
    switch (key) {
      case 'ArrowLeft':
        if (content.length > shifts) {
          setShifts(shifts + 1);
        }
        break;
      case 'ArrowRight':
        if (shifts > 0) {
          setShifts(shifts - 1);
        }
        break;
      case 'Delete':
        if (content.length >= shifts) {
          setShifts(shifts - 1);
        }
        break;
      case 'Home':
      case 'ArrowUp':
        setShifts(content.length);
        break;
      case 'End':
      case 'ArrowDown':
        setShifts(0);
        break;
      case 'Enter':
        // TODO: Ensure that it's okay to send the PREFIX to the backend
        // because if we remove the PREFIX, we can't tell which command
        // is input while the program is running and while the program is not running
        if (!debuggerClient) return;
        debuggerClient.sendStdin(content);
        appendConsoleChunk(`${content}\n`);
        clearInput();
        scrollToBottom();

        // const removedPrefixInput = removeStructsPrefix(content);
        // if (removedPrefixInput.length > 0) {
        //   socket.serverAction.sendStdin(removedPrefixInput);
        //   appendConsoleChunk(`${removedPrefixInput}\n`);
        //   clearInput();
        //   scrollToBottom();
        // }

        break;
      default:
        break;
    }
    if (!debuggerClient) return;

    // The program carries on after end-of-file, so the session stays open
    // to step through the rest of it.
    if (isCtrlPressed && key === 'd') {
      debuggerClient.sendEOF();
    }

    if (isCtrlPressed && key === 'c') {
      debuggerClient.interrupt();
      setActive(false);
    }
  }

  function handleOnFocus() {
    setPaused(false);
  }

  function handleOnBlur() {
    setPaused(true);
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    const { key, ctrlKey } = event;
    setIsCtrlPressed(ctrlKey);
    pauseWithTimeout();

    updateShifts(key);
  }

  function handleKeyUp(event: React.KeyboardEvent) {
    if (event.key === 'Control') {
      setIsCtrlPressed(false);
    }
  }

  return {
    handleOnFocus,
    handleOnBlur,
    handleKeyDown,
    handleKeyUp,
    shifts,
    paused,
  };
}

export default useCursor;
