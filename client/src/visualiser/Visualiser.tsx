import '@fontsource-variable/fredoka';
import { ReactElement, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Radio, RadioGroup } from '@ui-sdk/react/radio';
import { Button } from '@ui-sdk/react/button';
import { Toolbar, ToolbarButton } from '@ui-sdk/react/toolbar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui-sdk/react/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@ui-sdk/react/tooltip';
import logo from '@/assets/img/structs.png';
import {
  CheckIcon,
  ChevronDownIcon,
  ClearIcon,
  FitIcon,
  KeyboardIcon,
  LinkIcon,
  MinusIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  ReplayIcon,
  ShuffleIcon,
  StepBackIcon,
  StepForwardIcon,
  TerminalIcon,
  ToEndIcon,
  ToStartIcon,
} from '@/ui/icons';
import StructureArt from '@/ui/StructureArt';
import { Theme, ThemeMenuItem, ThemeToggle, useTheme } from '@/ui/theme';
import Stage from './Stage';
import CodeListing from './CodeListing';
import Keypad from './Keypad';
import StepScrubber from './StepScrubber';
import StructureNav from './StructureNav';
import ShortcutsDialog from './ShortcutsDialog';
import { TopicRoute, VisualiserProvider } from './VisualiserProvider';
import { useMediaQuery, useSession, useSnapshot } from './useVisualiser';
import { useNarration } from './useNarration';
import { operationLabel, shareLink, TopicInfo } from './topics';
import { canvasThemes } from './canvasThemes';
import styles from './Visualiser.module.css';

const SPEEDS = ['0.25', '0.5', '0.75', '1', '1.25', '1.5', '1.75', '2'].map((value) => ({
  value,
  label: `${value}×`,
}));

/** An insert can land just past the last node, while a delete needs a node at the index. */
const indexMaxFor = (args: string[], size: number) => {
  if (!args.includes('index')) return undefined;
  return args.includes('value') ? size : size - 1;
};

const Operations = ({ topic }: { topic: TopicInfo }) => {
  const documentation = useSnapshot((s) => s.documentation);
  const size = useSnapshot((s) => s.size);
  const commands = Object.keys(documentation);
  const [params] = useSearchParams();
  const requested = params.get('op');
  const [chosen, setChosen] = useState<string | null>(null);
  const fallback = requested && commands.includes(requested) ? requested : commands[0];
  const command = chosen ?? fallback;

  return (
    <section className={styles.ops} aria-labelledby="ops-title">
      <h2 id="ops-title" className={styles.panelTitle}>
        Operations
      </h2>
      <RadioGroup
        className={styles.opList}
        aria-labelledby="ops-title"
        value={command ?? null}
        onValueChange={(next: string | null) => next && setChosen(next)}
      >
        {commands.map((name) => (
          <Radio key={name} value={name} className={styles.op}>
            {operationLabel(topic, name)}
          </Radio>
        ))}
      </RadioGroup>

      {command && (
        <div className={styles.task}>
          <Keypad
            key={command}
            command={command}
            runLabel={`Run ${operationLabel(topic, command).toLowerCase()}`}
            indexMax={indexMaxFor(documentation[command].args, size)}
            classes={{
              form: styles.form,
              fields: styles.fields,
              field: styles.field,
              label: styles.label,
              input: styles.input,
              keys: styles.keys,
              key: styles.key,
              submit: styles.run,
              error: styles.error,
            }}
          />
        </div>
      )}
    </section>
  );
};

type CopyState = 'idle' | 'copied' | 'failed';

const CopyLink = ({ topic }: { topic: TopicInfo }) => {
  const session = useSession();
  const [state, setState] = useState<CopyState>('idle');

  useEffect(() => {
    if (state === 'idle') return undefined;
    const timer = setTimeout(() => setState('idle'), 2000);
    return () => clearTimeout(timer);
  }, [state]);

  const copy = () => {
    navigator.clipboard
      .writeText(shareLink(topic.slug, session.data, window.location.origin))
      .then(() => setState('copied'))
      .catch(() => setState('failed'));
  };

  return (
    <Button className={styles.utility} onClick={copy}>
      {state === 'copied' ? <CheckIcon size={16} /> : <LinkIcon size={16} />}
      <span aria-live="polite">
        {state === 'idle' && (
          <>
            Copy <span className={styles.utilityNoun}>link</span>
          </>
        )}
        {state === 'copied' && 'Link copied'}
        {state === 'failed' && 'Couldn’t copy'}
      </span>
    </Button>
  );
};

const DataActions = ({ topic }: { topic: TopicInfo }) => {
  const session = useSession();
  return (
    <div className={styles.utilities}>
      <Button className={styles.utility} onClick={session.generate}>
        <ShuffleIcon size={16} />
        New <span className={styles.utilityNoun}>{topic.noun}</span>
      </Button>
      <Button className={styles.utility} onClick={session.clear}>
        <ClearIcon size={16} />
        Clear
      </Button>
      <CopyLink topic={topic} />
    </div>
  );
};

const CodePanel = ({ topic }: { topic: TopicInfo }) => {
  const narration = useNarration(topic);
  return (
    <aside className={styles.code} aria-labelledby="code-title">
      <h2 id="code-title" className={styles.codeTitle}>
        Code
      </h2>
      <div className={styles.live} aria-live="polite">
        {narration.state !== 'idle' && (
          <div className={styles.narration} data-state={narration.state}>
            <p className={styles.narrationHead}>{narration.title}</p>
            {narration.state === 'done' && (
              <p className={styles.narrationBody}>
                Finished. Replay it, step back through it, or run another.
              </p>
            )}
          </div>
        )}
      </div>
      <CodeListing
        className={styles.listing}
        lineClassName={styles.codeLine}
        numberClassName={styles.codeNumber}
        emptyClassName={styles.codeEmpty}
        emptyMessage="Run an operation to see its C code here."
      />
    </aside>
  );
};

const IconTip = ({
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
  const session = useSession();
  const playing = useSnapshot((s) => s.playing);
  const complete = useSnapshot((s) => s.complete);
  const duration = useSnapshot((s) => s.duration);
  const step = useSnapshot((s) => s.step);
  const stepCount = useSnapshot((s) => s.stepCount);
  const speed = useSnapshot((s) => s.speed);
  const idle = duration === 0;

  let playLabel = 'Play';
  if (playing) playLabel = 'Pause';
  else if (complete) playLabel = 'Replay';

  return (
    <div className={styles.transport}>
      <Toolbar className={styles.toolbar} aria-label="Playback">
        <IconTip label="Back to the start">
          <ToolbarButton className={styles.tool} onClick={session.rewind} disabled={idle}>
            <ToStartIcon />
          </ToolbarButton>
        </IconTip>
        <IconTip label="Previous step">
          <ToolbarButton className={styles.tool} onClick={session.stepBackward} disabled={idle}>
            <StepBackIcon />
          </ToolbarButton>
        </IconTip>
        <ToolbarButton
          className={styles.play}
          onClick={session.togglePlay}
          disabled={idle}
          aria-label={playLabel}
        >
          {playing && <PauseIcon size={22} />}
          {!playing && complete && <ReplayIcon size={22} />}
          {!playing && !complete && <PlayIcon size={22} />}
        </ToolbarButton>
        <IconTip label="Next step">
          <ToolbarButton className={styles.tool} onClick={session.stepForward} disabled={idle}>
            <StepForwardIcon />
          </ToolbarButton>
        </IconTip>
        <IconTip label="Skip to the end">
          <ToolbarButton className={styles.tool} onClick={session.finish} disabled={idle}>
            <ToEndIcon />
          </ToolbarButton>
        </IconTip>
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

interface WorkspaceProps {
  topic: TopicInfo;
  theme: Theme;
}

/** Matches the stylesheet's smallest header, where the theme toggle moves into the More menu. */
const SMALL_HEADER = '(max-width: 560px)';

const Workspace = ({ topic, theme }: WorkspaceProps) => {
  const smallHeader = useMediaQuery(SMALL_HEADER);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.structsTheme = theme;
    return () => {
      delete root.dataset.structsTheme;
    };
  }, [theme]);

  return (
    <div className={styles.page} data-theme={theme}>
      <title>{`${topic.name} visualiser | structs.sh`}</title>
      <header className={styles.header}>
        <Link to="/" className={styles.brand} aria-label="structs.sh home">
          <img src={logo} alt="" width={34} height={34} />
          <span className={styles.brandText}>structs.sh</span>
        </Link>
        <StructureNav
          current={topic.slug}
          classes={{
            root: styles.structures,
            list: styles.structureList,
            link: styles.structure,
            more: styles.more,
            menu: styles.moreMenu,
            menuItem: styles.moreItem,
            menuSeparator: styles.moreSeparator,
          }}
          menuExtra={
            smallHeader && (
              <ThemeMenuItem className={styles.moreItem} indicatorClassName={styles.moreCheck} />
            )
          }
          renderLink={(t) => (
            <>
              <StructureArt id={t.slug} className={styles.structureArt} />
              <span>{t.title}</span>
            </>
          )}
          moreLabel={
            <>
              <PlusIcon size={16} />
              <span>More</span>
            </>
          }
        />
        <Link to="/debugger" className={styles.debugger}>
          <TerminalIcon size={18} />
          <span className={styles.debuggerText}>Debugger</span>
        </Link>
        <ShortcutsDialog
          trigger={<KeyboardIcon />}
          triggerClassName={`${styles.iconButton} ${styles.shortcuts}`}
          backdropClassName={styles.backdrop}
          contentClassName={styles.dialog}
          closeClassName={styles.dialogClose}
        />
        {!smallHeader && <ThemeToggle className={styles.iconButton} />}
      </header>

      <div className={styles.main}>
        <Operations topic={topic} />
        <div className={styles.stageWrap}>
          <Stage label={`${topic.name} drawing`} className={styles.stage}>
            {(view) => (
              <>
                <DataActions topic={topic} />
                <Toolbar className={styles.zoom} aria-label="Zoom" orientation="vertical">
                  <ToolbarButton
                    className={styles.zoomButton}
                    onClick={view.zoomIn}
                    aria-label="Zoom in"
                  >
                    <PlusIcon size={18} />
                  </ToolbarButton>
                  <ToolbarButton
                    className={styles.zoomButton}
                    onClick={view.fit}
                    aria-label="Fit to screen"
                  >
                    <FitIcon size={18} />
                  </ToolbarButton>
                  <ToolbarButton
                    className={styles.zoomButton}
                    onClick={view.zoomOut}
                    aria-label="Zoom out"
                  >
                    <MinusIcon size={18} />
                  </ToolbarButton>
                </Toolbar>
              </>
            )}
          </Stage>
          <Transport />
        </div>
        <CodePanel topic={topic} />
      </div>
    </div>
  );
};

const PHONE = '(max-width: 700px)';

/** On a phone the engine's 8 to 12 nodes or bars shrink until their values are hard to read. */
const phoneCounts: Record<string, number> = { 'Linked Lists': 5, 'Sorting Algorithms': 7 };

const phoneFriendlyData = (topicTitle: string) => {
  const count = phoneCounts[topicTitle];
  if (!count || !window.matchMedia?.(PHONE).matches) return undefined;
  const values = new Set<number>();
  while (values.size < count) values.add(Math.ceil(Math.random() * 99));
  return [...values];
};

const Visualiser = () => {
  const theme = useTheme();
  return (
    <TopicRoute>
      {(topic) => (
        <VisualiserProvider
          key={topic.slug}
          topic={topic}
          theme={canvasThemes[theme]}
          makeData={phoneFriendlyData}
        >
          <Workspace topic={topic} theme={theme} />
        </VisualiserProvider>
      )}
    </TopicRoute>
  );
};

export default Visualiser;
