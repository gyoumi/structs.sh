import styles from '@/styles/Timeline.module.css';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import CircularProgress from '@mui/material/CircularProgress';
import { useEffect, useState, useCallback } from 'react';
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

type ControlsStage = 'idle' | 'fetchingStep' | 'playRequested' | 'buffering';

const togglePlayRequest = (stage: ControlsStage): ControlsStage => {
  if (stage === 'idle') return 'playRequested';
  if (stage === 'playRequested') return 'idle';
  return stage;
};

const cancelPlayRequest = (stage: ControlsStage): ControlsStage =>
  stage === 'playRequested' ? 'idle' : stage;

const Controls = () => {
  const { latestProgramState } = useGlobalStore();
  const { userAnnotation, parser } = useGlobalStore().visualizer;
  const { startDebugging, requestSteps, requestNextStep } = useDebugger();
  const { states, currentIndex, stepForward, stepBackward, jumpToState, isActive } =
    useFrontendStateStore();

  const [stage, setStage] = useState<ControlsStage>('idle');
  const isBuffering = stage === 'buffering';
  const isFetchingStep = stage === 'fetchingStep';
  const atLatestState = currentIndex >= states.length - 1;

  const { setToastMessage: setMessage } = useToastStateStore();
  const compilerStatus = useCompilerStatusStore((state) => state.status);

  const buffer = useCallback(
    async (bufferSize: number) => {
      setStage('buffering');

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

      setStage('idle');
    },
    [requestSteps, setMessage]
  );

  const fetchNextStep = async () => {
    setStage('fetchingStep');
    const gotState = await requestNextStep();
    setStage('idle');
    if (gotState) stepForward();
  };

  useEffect(() => {
    if (!isActive) {
      setStage(cancelPlayRequest);
    }
  }, [isActive]);

  useEffect(() => {
    if (stage !== 'playRequested') return;
    if (states.length - currentIndex < BUFFER_THRESHOLD) {
      buffer(BUFFER_THRESHOLD);
    } else {
      setMessage({
        content: 'Buffer completed.',
        colorTheme: 'info',
        durationMs: DEFAULT_MESSAGE_DURATION,
      });

      setStage('idle');
    }
  }, [stage, currentIndex, setMessage, buffer, states.length]);

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
          setStage(cancelPlayRequest);
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
      <Button
        disabled={!isActive}
        onClick={() => setStage(togglePlayRequest)}
        className="Onboarding-playButton"
      >
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
        disabled={isFetchingStep || currentIndex <= 0}
        onClick={() => {
          stepBackward();
        }}
      >
        <UndoIcon />
      </Button>

      <Button
        disabled={isFetchingStep || (atLatestState && (isBuffering || !isActive))}
        onClick={atLatestState ? fetchNextStep : stepForward}
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
