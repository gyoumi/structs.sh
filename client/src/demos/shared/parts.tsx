import { useEffect, useId, useMemo, useRef, type ReactElement, type ReactNode } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui-sdk/react/select';
import { useShortcut } from '@ui-sdk/react/shortcuts';
import {
  Slider,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
} from '@ui-sdk/react/slider';
import { Toolbar, ToolbarButton, ToolbarGroup } from '@ui-sdk/react/toolbar';
import { Tooltip, TooltipContent, TooltipShortcut, TooltipTrigger } from '@ui-sdk/react/tooltip';
import { palette as enginePalette } from '@/visualiser-src/common/palette';
import {
  FitIcon,
  MinusIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  ReplayIcon,
  StepBackIcon,
  StepForwardIcon,
  ToEndIcon,
  ToStartIcon,
} from './icons';
import type { StageHandle } from './Stage';
import type { TopicInfo } from './topics';
import { SPEEDS, useProgress, useStep, type Visualiser } from './useVisualiser';

export const cx = (...names: (string | false | null | undefined)[]): string =>
  names.filter(Boolean).join(' ');

/* -------------------------------- Tooltips -------------------------------- */

interface HintProps {
  label: ReactNode;
  shortcut?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  /** The control the hint describes. It becomes the tooltip's trigger. */
  children: ReactElement<Record<string, unknown>>;
}

export const Hint = ({ label, shortcut, side = 'top', children }: HintProps) => (
  <Tooltip shortcut={shortcut} delay={450}>
    <TooltipTrigger render={children} />
    <TooltipContent side={side} sideOffset={8} className="sx-tooltip">
      {label}
      {shortcut ? <TooltipShortcut className="sx-kbd" /> : null}
    </TooltipContent>
  </Tooltip>
);

/* -------------------------------- Transport ------------------------------- */

export const KEYS = {
  toggle: 'space',
  stepForward: 'arrowright',
  stepBack: 'arrowleft',
  toStart: 'home',
  toEnd: 'end',
  slower: '[',
  faster: ']',
  fit: 'f',
} as const;

/** Binds the playback keys for as long as the page is mounted. */
export const useTransportShortcuts = (visualiser: Visualiser, stage?: StageHandle): void => {
  const shiftSpeed = (direction: 1 | -1) => {
    const index = SPEEDS.indexOf(visualiser.speed) + direction;
    if (index >= 0 && index < SPEEDS.length) visualiser.setSpeed(SPEEDS[index]);
  };
  useShortcut(KEYS.toggle, visualiser.toggle, { description: 'Play or pause' });
  useShortcut(KEYS.stepForward, visualiser.stepForward, { description: 'Step forward' });
  useShortcut(KEYS.stepBack, visualiser.stepBack, { description: 'Step back' });
  useShortcut(KEYS.toStart, visualiser.toStart, { description: 'Back to start' });
  useShortcut(KEYS.toEnd, visualiser.toEnd, { description: 'Skip to end' });
  useShortcut(KEYS.slower, () => shiftSpeed(-1), { description: 'Slower' });
  useShortcut(KEYS.faster, () => shiftSpeed(1), { description: 'Faster' });
  useShortcut(stage ? KEYS.fit : null, () => stage?.fit(), { description: 'Fit to view' });
};

interface TransportProps {
  visualiser: Visualiser;
  className?: string;
  /** Leave out the jump-to-start and jump-to-end buttons where space is tight. */
  compact?: boolean;
  tooltipSide?: HintProps['side'];
}

export const Transport = ({ visualiser, className, compact, tooltipSide }: TransportProps) => {
  const { status } = visualiser;
  const idle = visualiser.stepMarks.length === 0;
  const main =
    status === 'playing'
      ? { label: 'Pause', icon: <PauseIcon />, action: visualiser.pause }
      : status === 'done'
        ? { label: 'Replay', icon: <ReplayIcon />, action: visualiser.replay }
        : { label: 'Play', icon: <PlayIcon />, action: visualiser.play };
  return (
    <Toolbar
      aria-label="Playback"
      className={cx('sx-transport', className)}
      data-status={status}
      disabled={idle}
    >
      <ToolbarGroup className="sx-transport-group">
        {compact ? null : (
          <Hint label="Back to start" shortcut={KEYS.toStart} side={tooltipSide}>
            <ToolbarButton aria-label="Back to start" onClick={visualiser.toStart}>
              <ToStartIcon />
            </ToolbarButton>
          </Hint>
        )}
        <Hint label="Step back" shortcut={KEYS.stepBack} side={tooltipSide}>
          <ToolbarButton aria-label="Step back" onClick={visualiser.stepBack}>
            <StepBackIcon />
          </ToolbarButton>
        </Hint>
        <Hint label={main.label} shortcut={KEYS.toggle} side={tooltipSide}>
          <ToolbarButton aria-label={main.label} data-role="play" onClick={main.action}>
            {main.icon}
          </ToolbarButton>
        </Hint>
        <Hint label="Step forward" shortcut={KEYS.stepForward} side={tooltipSide}>
          <ToolbarButton
            aria-label="Step forward"
            onClick={visualiser.stepForward}
            disabled={status === 'done'}
          >
            <StepForwardIcon />
          </ToolbarButton>
        </Hint>
        {compact ? null : (
          <Hint label="Skip to end" shortcut={KEYS.toEnd} side={tooltipSide}>
            <ToolbarButton
              aria-label="Skip to end"
              onClick={visualiser.toEnd}
              disabled={status === 'done'}
            >
              <ToEndIcon />
            </ToolbarButton>
          </Hint>
        )}
      </ToolbarGroup>
    </Toolbar>
  );
};

/* -------------------------------- Timeline -------------------------------- */

interface ScrubberProps {
  visualiser: Visualiser;
  className?: string;
  /** Draw a mark where each step ends. */
  marks?: boolean;
}

/** The timeline. Dragging pauses playback and picks it up again on release. */
export const Scrubber = ({ visualiser, className, marks = true }: ScrubberProps) => {
  const progress = useProgress(visualiser);
  const done = useStep(visualiser);
  const idle = visualiser.stepMarks.length === 0;
  return (
    <Slider
      className={cx('sx-scrubber', className)}
      value={progress}
      min={0}
      max={100}
      step={0.1}
      largeStep={10}
      disabled={idle}
      onValueChange={(value) => {
        visualiser.beginScrub();
        visualiser.seek(value as number);
      }}
      onValueCommit={visualiser.endScrub}
    >
      <SliderControl className="sx-scrubber-control">
        <SliderTrack className="sx-scrubber-track">
          <SliderIndicator className="sx-scrubber-fill" />
          {marks
            ? visualiser.stepMarks
                .slice(0, -1)
                .map((mark, index) => (
                  <i
                    key={mark}
                    className="sx-scrubber-mark"
                    data-passed={index < done || undefined}
                    style={{ insetInlineStart: `${mark}%` }}
                  />
                ))
            : null}
          <SliderThumb className="sx-scrubber-thumb" aria-label="Timeline position" />
        </SliderTrack>
      </SliderControl>
    </Slider>
  );
};

/** "Step 3 of 12", or nothing before the first operation. */
export const StepCount = ({
  visualiser,
  className,
  idle = null,
}: {
  visualiser: Visualiser;
  className?: string;
  idle?: ReactNode;
}) => {
  const done = useStep(visualiser);
  const total = visualiser.stepMarks.length;
  if (total === 0) return idle ? <span className={className}>{idle}</span> : null;
  return (
    <span className={cx('sx-stepcount', className)}>
      Step <b>{Math.min(done + (visualiser.status === 'done' ? 0 : 1), total)}</b> of {total}
    </span>
  );
};

/* ---------------------------------- Speed --------------------------------- */

export const formatSpeed = (speed: number): string => `${speed}×`;

export const SpeedSelect = ({
  visualiser,
  className,
}: {
  visualiser: Visualiser;
  className?: string;
}) => (
  <Select
    value={String(visualiser.speed)}
    onValueChange={(value) => {
      if (value) visualiser.setSpeed(Number(value));
    }}
  >
    <Hint label="Playback speed" shortcut={`${KEYS.slower} ${KEYS.faster}`}>
      <SelectTrigger className={cx('sx-speed', className)} aria-label="Playback speed">
        <SelectValue />
      </SelectTrigger>
    </Hint>
    <SelectContent className="sx-menu" side="top" align="end" sideOffset={8}>
      {SPEEDS.map((speed) => (
        <SelectItem key={speed} value={String(speed)} className="sx-menu-item">
          {formatSpeed(speed)}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

/* ---------------------------------- Code ---------------------------------- */

const C_KEYWORDS =
  /\b(struct|int|void|return|if|else|while|for|NULL|bool|true|false|break|continue|sizeof)\b/;

const tokenise = (line: string): ReactNode[] => {
  const parts = line.split(
    /(\/\/.*$|\b(?:struct|int|void|return|if|else|while|for|NULL|bool|true|false|break|continue|sizeof)\b|\b\d+\b)/
  );
  return parts.map((part, index) => {
    const key = `${index}:${part}`;
    if (part.startsWith('//')) {
      return (
        <span key={key} data-token="comment">
          {part}
        </span>
      );
    }
    if (C_KEYWORDS.test(part)) {
      return (
        <span key={key} data-token="keyword">
          {part}
        </span>
      );
    }
    if (/^\d+$/.test(part)) {
      return (
        <span key={key} data-token="number">
          {part}
        </span>
      );
    }
    return part;
  });
};

interface CodePanelProps {
  visualiser: Visualiser;
  className?: string;
  /** Shown until an operation puts code here. */
  placeholder?: ReactNode;
}

/** The C for the running operation, with the executing line marked. */
export const CodePanel = ({ visualiser, className, placeholder }: CodePanelProps) => {
  const { lines, active } = visualiser.code;
  const list = useRef<HTMLOListElement | null>(null);

  useEffect(() => {
    if (active === null) return;
    const line = list.current?.children[active];
    if (line instanceof HTMLElement) {
      line.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [active]);

  if (lines.length === 0) {
    return <div className={cx('sx-code sx-code-empty', className)}>{placeholder}</div>;
  }
  return (
    <ol ref={list} className={cx('sx-code', className)} aria-label="Code for this operation">
      {lines.map((line, index) => (
        <li
          // The lines of one snippet never reorder.

          key={index}
          className="sx-code-line"
          data-active={index === active || undefined}
          aria-current={index === active ? 'step' : undefined}
          style={{ paddingInlineStart: `calc(var(--sx-code-pad, 0.75rem) + ${line.indent}ch)` }}
        >
          {line.text === '' ? ' ' : tokenise(line.text)}
        </li>
      ))}
    </ol>
  );
};

/* --------------------------------- Legend --------------------------------- */

export const Legend = ({ topic, className }: { topic: TopicInfo; className?: string }) => (
  <ul className={cx('sx-legend', className)} aria-label="What the colours mean">
    {topic.legend.map((entry) => (
      <li key={entry.colour} className="sx-legend-item">
        <i className="sx-legend-chip" style={{ background: enginePalette[entry.colour] }} />
        {entry.label}
      </li>
    ))}
  </ul>
);

/* ---------------------------------- Zoom ---------------------------------- */

export const ZoomControls = ({
  stage,
  className,
  tooltipSide = 'left',
}: {
  stage: StageHandle;
  className?: string;
  tooltipSide?: HintProps['side'];
}) => (
  <Toolbar aria-label="View" orientation="vertical" className={cx('sx-zoom', className)}>
    <Hint label="Zoom in" side={tooltipSide}>
      <ToolbarButton aria-label="Zoom in" onClick={stage.zoomIn}>
        <PlusIcon />
      </ToolbarButton>
    </Hint>
    <Hint label="Zoom out" side={tooltipSide}>
      <ToolbarButton aria-label="Zoom out" onClick={stage.zoomOut}>
        <MinusIcon />
      </ToolbarButton>
    </Hint>
    <Hint label="Fit to view" shortcut={KEYS.fit} side={tooltipSide}>
      <ToolbarButton aria-label="Fit to view" onClick={stage.fit}>
        <FitIcon />
      </ToolbarButton>
    </Hint>
  </Toolbar>
);

/* --------------------------------- Helpers -------------------------------- */

/** An id that's safe to use in `aria-labelledby` and as an SVG `href`. */
export const useDomId = (prefix: string): string => {
  const id = useId();
  return useMemo(() => `${prefix}-${id.replace(/[^a-zA-Z0-9]/g, '')}`, [prefix, id]);
};
