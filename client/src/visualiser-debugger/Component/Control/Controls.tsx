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
import { isInitialProgramState } from '@/visualiser-debugger/Types/programState';
import {
  DEFAULT_MESSAGE_DURATION,
  useToastStateStore,
} from '@/visualiser-debugger/Store/toastStateStore';

const BUFFER_THRESHOLD = 30;

type BufferStage = 'off' | 'requested' | 'buffering';

const Controls = () => {
  const { latestProgramState } = useGlobalStore();
  const { userAnnotation, parser } = useGlobalStore().visualizer;
  const { startDebugging, requestSteps, requestNextStep } = useDebugger();
  const { states, currentIndex, stepForward, stepBackward, jumpToState, isActive } =
    useFrontendStateStore();

  const [bufferStage, setBufferStage] = useState<BufferStage>('off');
  const isBuffering = bufferStage === 'buffering';
  const [awaitingNextState, setAwaitingNextState] = useState<boolean>(false);
  const atLatestState = currentIndex >= states.length - 1;

  const bufferingRef = useRef<boolean>(false);
  const { setToastMessage: setMessage } = useToastStateStore();
  const compilerStatus = useCompilerStatusStore((state) => state.status);

  const toggleBuffering = () => {
    setBufferStage((stage) => {
      if (stage === 'buffering') return stage;
      return stage === 'off' ? 'requested' : 'off';
    });
  };

  const startBuffering = useCallback(
    async (bufferSize: number) => {
      if (bufferingRef.current) return;
      bufferingRef.current = true;
      setBufferStage('buffering');

      setMessage({
        content: 'Buffer started.',
        colorTheme: 'warning',
        durationMs: DEFAULT_MESSAGE_DURATION,
      });

      await requestSteps(bufferSize);

      setMessage({
        content: 'Buffer completed.',
        colorTheme: 'info',
        durationMs: DEFAULT_MESSAGE_DURATION,
      });

      setBufferStage('off');
      bufferingRef.current = false;
    },
    [requestSteps, setMessage]
  );

  useEffect(() => {
    if (!isActive) {
      setBufferStage('off');
    }
  }, [isActive]);

  useEffect(() => {
    if (bufferStage !== 'requested' || bufferingRef.current) return;
    if (states.length - currentIndex < BUFFER_THRESHOLD) {
      startBuffering(BUFFER_THRESHOLD);
    } else {
      setMessage({
        content: 'Buffer completed.',
        colorTheme: 'info',
        durationMs: DEFAULT_MESSAGE_DURATION,
      });

      setBufferStage('off');
    }
  }, [bufferStage, currentIndex, setMessage, startBuffering, states.length]);

  useEffect(() => {
    if (isInitialProgramState(latestProgramState)) {
      return;
    }

    if (latestProgramState && userAnnotation) {
      const newParsedState = parser.parseState(latestProgramState, userAnnotation);
      useFrontendStateStore.getState().pushOrReplaceLatestStep(latestProgramState, newParsedState);
    } else {
      let issue = 'something';
      if (!latestProgramState) {
        issue = 'latestProgramState';
      } else if (!userAnnotation) {
        issue = 'localsAnnotations';
      }
      console.error(`Unable to parse program state: ${issue} is undefined`);
    }
  }, [latestProgramState, userAnnotation, parser]);

  return (
    <div className={styles.timeline}>
      <Button
        variant="primary"
        onClick={() => {
          setBufferStage('off');
          startDebugging();
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
      <Button disabled={!isActive} onClick={toggleBuffering} className="Onboarding-playButton">
        {isBuffering ? (
          <Fade in={isBuffering} timeout={500}>
            <CircularProgress size={24} />
          </Fade>
        ) : (
          <Fade in={!isBuffering} timeout={500}>
            <PlayArrowIcon />
          </Fade>
        )}
      </Button>

      <Button
        disabled={awaitingNextState || currentIndex <= 0}
        onClick={() => {
          stepBackward();
        }}
      >
        <UndoIcon />
      </Button>

      <Button
        disabled={awaitingNextState || (!isActive && atLatestState)}
        onClick={async () => {
          if (!atLatestState) {
            stepForward();
            return;
          }
          setAwaitingNextState(true);
          const gotState = await requestNextStep();
          setAwaitingNextState(false);
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
        loading={isBuffering}
      />
    </div>
  );
};

export default Controls;
