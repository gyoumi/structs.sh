import styles from '@/styles/Timeline.module.css';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import CircularProgress from '@mui/material/CircularProgress';
import { useEffect, useRef, useState, useCallback } from 'react';
import { Fade } from '@mui/material';
import { handleCompileClicked } from '@/visualiser-debugger/Store/onboardingStore';
import { useDebugger } from '@/Services/useDebugger';
import { useCompilerStatusStore } from '@/Services/debugger/compilerStatusStore';
import { useFrontendStateStore } from '@/visualiser-debugger/Store/frontendStateStore';
import { Button } from '@/components/Button';
import Slider from '@/components/Timeline/Slider';
import { useGlobalStore } from '@/visualiser-debugger/Store/globalStateStore';
import { isInitialBackendState } from '@/visualiser-debugger/Types/backendType';
import {
  DEFAULT_MESSAGE_DURATION,
  useToastStateStore,
} from '@/visualiser-debugger/Store/toastStateStore';

const BUFFER_THRESHOLD = 30;
const Controls = () => {
  const { currFrame } = useGlobalStore();
  const { userAnnotation, parser } = useGlobalStore().visualizer;
  const { sendCode, bulkSendNextStates, getNextState } = useDebugger();
  const { states, currentIndex, stepForward, stepBackward, jumpToState, isActive } =
    useFrontendStateStore();

  const [loading, setLoading] = useState<boolean>(false);
  /** Whether a step forward is waiting for the debugger's next state. */
  const [fetching, setFetching] = useState<boolean>(false);
  const atLatestState = currentIndex >= states.length - 1;
  const [bufferMode, setBufferMode] = useState<boolean>(false);

  // Avoid race condition
  const bufferingRef = useRef<boolean>(false);
  const { setToastMessage: setMessage } = useToastStateStore();
  const compilerStatus = useCompilerStatusStore((state) => state.status);

  const playToggle = () => {
    setBufferMode((mode) => !mode);
  };

  const startBuffering = useCallback(
    async (bufferSize: number) => {
      if (bufferingRef.current) return;
      bufferingRef.current = true;
      setLoading(true);

      setMessage({
        content: 'Buffer started.',
        colorTheme: 'warning',
        durationMs: DEFAULT_MESSAGE_DURATION,
      });

      await bulkSendNextStates(bufferSize);

      setMessage({
        content: 'Buffer completed.',
        colorTheme: 'info',
        durationMs: DEFAULT_MESSAGE_DURATION,
      });

      setLoading(false);
      setBufferMode(false);
      bufferingRef.current = false;
    },
    [bulkSendNextStates, setMessage]
  );

  useEffect(() => {
    if (!isActive) {
      setBufferMode(false);
      setLoading(false);
    }
  }, [isActive]);

  useEffect(() => {
    if (!bufferMode || bufferingRef.current) return;
    if (states.length - currentIndex < BUFFER_THRESHOLD) {
      startBuffering(BUFFER_THRESHOLD);
    } else {
      // There's no need to buffer at this point
      setMessage({
        content: 'Buffer completed.',
        colorTheme: 'info',
        durationMs: DEFAULT_MESSAGE_DURATION,
      });

      setBufferMode(false);
    }
  }, [bufferMode, currentIndex, setMessage, startBuffering, states.length]);

  // New states join the timeline as they arrive (see useDebugger). This parses
  // the latest one again when the annotations or the visualiser change.
  useEffect(() => {
    if (isInitialBackendState(currFrame)) {
      return;
    }

    if (currFrame && userAnnotation) {
      const newParsedState = parser.parseState(currFrame, userAnnotation);
      useFrontendStateStore.getState().appendFrontendNewState(currFrame, newParsedState);
    } else {
      let issue = 'something';
      if (!currFrame) {
        issue = 'backendState';
      } else if (!userAnnotation) {
        issue = 'localsAnnotations';
      }
      console.error(`Unable to parse backend state: ${issue} is undefined`);
    }
  }, [currFrame, userAnnotation, parser]);

  return (
    <div className={styles.timeline}>
      <Button
        variant="primary"
        onClick={() => {
          setBufferMode(false);
          setLoading(false);
          sendCode();
          handleCompileClicked();
        }}
        className="Onboarding-compileButton"
      >
        Compile
      </Button>
      {compilerStatus?.state === 'loading' && (
        <span role="status" className={styles.compilerStatus}>
          Loading compiler {Math.floor((100 * compilerStatus.done) / compilerStatus.total)}%
        </span>
      )}
      <Button disabled={!isActive} onClick={playToggle} className="Onboarding-playButton">
        {loading ? (
          <Fade in={loading} timeout={500}>
            <CircularProgress size={24} />
          </Fade>
        ) : (
          <Fade in={!loading} timeout={500}>
            <PlayArrowIcon />
          </Fade>
        )}
      </Button>

      {/* Step Backward BTN: still works once the session has ended */}
      <Button
        disabled={fetching || currentIndex <= 0}
        onClick={() => {
          stepBackward();
        }}
      >
        <UndoIcon />
      </Button>

      {/* Step Forward BTN */}
      <Button
        disabled={fetching || (!isActive && atLatestState)}
        onClick={async () => {
          if (!atLatestState) {
            stepForward();
            return;
          }
          setFetching(true);
          const gotState = await getNextState();
          setFetching(false);
          // The new state is already on the timeline, so move to it.
          if (gotState) stepForward();
        }}
      >
        <RedoIcon />
      </Button>
      <Slider
        max={states.length - 1}
        value={currentIndex}
        onChange={(event: Event, value: number | number[], _activeThumb: number) => {
          if (typeof value !== 'number') return;

          jumpToState(value as number);
        }}
        loading={loading}
      />
    </div>
  );
};

export default Controls;
