import { ReactElement } from 'react';
import { Toolbar, ToolbarButton } from '@ui-sdk/react/toolbar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui-sdk/react/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@ui-sdk/react/tooltip';
import {
  ChevronDownIcon,
  PauseIcon,
  PlayIcon,
  ReplayIcon,
  StepBackwardIcon,
  StepForwardIcon,
  ToEndIcon,
  ToStartIcon,
} from '@/ui/icons';
import StepScrubber from './StepScrubber';
import { usePlayback, usePlaybackSnapshot } from './playback';
import styles from './Transport.module.css';

const SPEEDS = ['0.25', '0.5', '0.75', '1', '1.25', '1.5', '1.75', '2'].map((value) => ({
  value,
  label: `${value}×`,
}));

const IconTooltip = ({
  label,
  children,
}: {
  label: string;
  children: ReactElement<Record<string, unknown>>;
}) => (
  <Tooltip delay={500} type="label">
    <TooltipTrigger render={children} />
    <TooltipContent className={styles.tooltip} sideOffset={10}>
      {label}
    </TooltipContent>
  </Tooltip>
);

const Transport = () => {
  const session = usePlayback();
  const playback = usePlaybackSnapshot((s) => s.playback);
  const duration = usePlaybackSnapshot((s) => s.duration);
  const step = usePlaybackSnapshot((s) => s.step);
  const stepCount = usePlaybackSnapshot((s) => s.stepCount);
  const speed = usePlaybackSnapshot((s) => s.speed);
  const idle = duration === 0;

  let playLabel = 'Play';
  if (playback === 'playing') playLabel = 'Pause';
  else if (playback === 'complete') playLabel = 'Replay';

  return (
    <div className={styles.transport}>
      <Toolbar className={styles.toolbar} aria-label="Playback">
        <IconTooltip label="Back to the start">
          <ToolbarButton className={styles.tool} onClick={session.rewind} disabled={idle}>
            <ToStartIcon />
          </ToolbarButton>
        </IconTooltip>
        <IconTooltip label="Previous step">
          <ToolbarButton className={styles.tool} onClick={session.stepBackward} disabled={idle}>
            <StepBackwardIcon />
          </ToolbarButton>
        </IconTooltip>
        <ToolbarButton
          className={styles.play}
          onClick={session.togglePlay}
          disabled={idle}
          aria-label={playLabel}
        >
          {playback === 'playing' && <PauseIcon size={22} />}
          {playback === 'complete' && <ReplayIcon size={22} />}
          {playback === 'paused' && <PlayIcon size={22} />}
        </ToolbarButton>
        <IconTooltip label="Next step">
          <ToolbarButton className={styles.tool} onClick={session.stepForward} disabled={idle}>
            <StepForwardIcon />
          </ToolbarButton>
        </IconTooltip>
        <IconTooltip label="Skip to the end">
          <ToolbarButton className={styles.tool} onClick={session.finish} disabled={idle}>
            <ToEndIcon />
          </ToolbarButton>
        </IconTooltip>
      </Toolbar>

      <StepScrubber
        classes={{
          root: styles.slider,
          control: styles.sliderControl,
          track: styles.sliderTrack,
          indicator: styles.sliderFill,
          thumb: styles.sliderThumb,
        }}
      />

      <p className={styles.stepCount}>
        {idle ? 'No steps yet' : `Step ${Math.min(step, stepCount)} of ${stepCount}`}
      </p>

      <Select
        items={SPEEDS}
        value={String(speed)}
        onValueChange={(next: string | null) => next && session.setSpeed(Number(next))}
      >
        <SelectTrigger className={styles.speed} aria-label="Speed">
          <SelectValue />
          <ChevronDownIcon size={16} />
        </SelectTrigger>
        <SelectContent className={styles.speedMenu} side="top" sideOffset={8}>
          {SPEEDS.map((item) => (
            <SelectItem key={item.value} value={item.value} className={styles.speedItem}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default Transport;
