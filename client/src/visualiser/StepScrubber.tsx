import { ReactNode } from 'react';
import {
  Slider,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
} from '@ui-sdk/react/slider';
import { usePlayback, usePlaybackSnapshot } from './playback';

export interface StepScrubberClasses {
  root?: string;
  control?: string;
  track?: string;
  indicator?: string;
  thumb?: string;
}

interface StepScrubberProps {
  classes: StepScrubberClasses;
  label?: string;
  thumb?: ReactNode;
}

const StepScrubber = ({ classes, label = 'Animation progress', thumb }: StepScrubberProps) => {
  const session = usePlayback();
  const progress = usePlaybackSnapshot((s) => s.progress);
  const duration = usePlaybackSnapshot((s) => s.duration);

  return (
    <Slider
      className={classes.root}
      value={progress}
      min={0}
      max={100}
      step={0.1}
      largeStep={10}
      disabled={duration === 0}
      format={(value: number) => `${Math.round(value)}%`}
      onValueChange={(value, details) => {
        if (details.reason === 'imperative') return;
        session.seekToPercent(Array.isArray(value) ? value[0] : value);
      }}
    >
      <SliderControl className={classes.control}>
        <SliderTrack className={classes.track}>
          <SliderIndicator className={classes.indicator} />
          <SliderThumb className={classes.thumb} aria-label={label}>
            {thumb}
          </SliderThumb>
        </SliderTrack>
      </SliderControl>
    </Slider>
  );
};

export default StepScrubber;
