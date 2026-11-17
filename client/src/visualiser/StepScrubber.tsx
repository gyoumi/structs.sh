import { ReactNode } from 'react';
import {
  Slider,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
} from '@ui-sdk/react/slider';
import { useSession, useSnapshot } from './useVisualiser';

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
  const session = useSession();
  const progress = useSnapshot((s) => s.progress);
  const duration = useSnapshot((s) => s.duration);

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
        session.seek(Array.isArray(value) ? value[0] : value);
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
