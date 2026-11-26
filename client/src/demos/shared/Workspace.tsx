import { Link } from 'react-router-dom';
import { Button } from '@ui-sdk/react/button';
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@ui-sdk/react/dialog';
import logo from '@/assets/img/structs.png';
import type { VisualiserPalette } from '@/visualiser-src/common/palette';
import { StructureArt } from './art';
import { BugIcon, ClearIcon, CloseIcon, KeyboardIcon, ShuffleIcon } from './icons';
import { OperationPad } from './OperationPad';
import { DEBUGGER_PATH, DemoFrame, MissingTopic, useTitle, useTopicParam } from './page';
import {
  CodePanel,
  cx,
  Hint,
  Legend,
  Scrubber,
  SpeedSelect,
  StepCount,
  Transport,
  useDomId,
  useTransportShortcuts,
  ZoomControls,
} from './parts';
import { Stage, useStage, type Insets } from './Stage';
import { StructureTabs } from './StructureTabs';
import { formatCall, type TopicInfo } from './topics';
import { useVisualiser } from './useVisualiser';
import './workspace.css';

export interface WorkspaceConfig {
  /** `/1`, `/2` and so on. */
  base: string;
  /** The demo's class, which carries its tokens. */
  className: string;
  /** The engine's colours, or a way to pick them from the topic on screen. */
  palette: Partial<VisualiserPalette> | ((topic: TopicInfo) => Partial<VisualiserPalette>);
  /** Keep the numbers on sorting bars in ink, for demos that draw on a light surface. */
  inkNumbers?: boolean;
  /** Show each structure's drawing in its tab. */
  tabArt?: boolean;
  /** Room to leave around a fitted drawing. A demo with floating panels sets the frame in CSS instead. */
  insets?: Insets;
}

const DEFAULT_INSETS: Insets = { top: 64, right: 64, bottom: 32, left: 32 };

const shortcuts: [string, string][] = [
  ['Space', 'Play or pause'],
  ['→', 'Step forward'],
  ['←', 'Step back'],
  ['Home', 'Back to the start'],
  ['End', 'Skip to the end'],
  ['[', 'Slower'],
  [']', 'Faster'],
  ['F', 'Fit the drawing'],
];

/** Keyboard shortcuts and the colour key, kept out of the way until asked for. */
const HelpDialog = ({ topic }: { topic: TopicInfo }) => (
  <Dialog>
    <Hint label="Shortcuts and colours" shortcut="?" side="bottom">
      <DialogTrigger className="sx-bar-button" aria-label="Shortcuts and colours" shortcut="?">
        <KeyboardIcon />
      </DialogTrigger>
    </Hint>
    <DialogBackdrop className="sx-backdrop" />
    <DialogContent className="sx-dialog">
      <header className="sx-dialog-head">
        <DialogTitle className="sx-dialog-title">Shortcuts</DialogTitle>
        <DialogClose className="sx-bar-button" aria-label="Close">
          <CloseIcon />
        </DialogClose>
      </header>
      <dl className="sx-shortcuts">
        {shortcuts.map(([keys, action]) => (
          <div key={keys}>
            <dt>
              <kbd>{keys}</kbd>
            </dt>
            <dd>{action}</dd>
          </div>
        ))}
      </dl>
      <h3 className="sx-dialog-title">Colours</h3>
      <Legend topic={topic} className="sx-dialog-legend" />
    </DialogContent>
  </Dialog>
);

const Workbench = ({ topic, config }: { topic: TopicInfo; config: WorkspaceConfig }) => {
  const palette = typeof config.palette === 'function' ? config.palette(topic) : config.palette;
  const visualiser = useVisualiser(topic, { palette });
  const stage = useStage(visualiser, config.insets ?? DEFAULT_INSETS);
  const codeTitle = useDomId('sx-code');
  useTransportShortcuts(visualiser, stage);
  useTitle(`${topic.title} | Structs.sh`);

  return (
    <DemoFrame
      className={cx(config.className, 'sx-app', config.inkNumbers && 'sx-ink-numbers')}
      topic={topic.slug}
    >
      <header className="sx-bar">
        <Link to={config.base} className="sx-brand" aria-label="Structs.sh home">
          <img src={logo} alt="" width={32} height={32} />
          <span>Structs.sh</span>
        </Link>
        <StructureTabs
          base={config.base}
          current={topic}
          renderTab={
            config.tabArt
              ? (tab) => (
                  <>
                    <StructureArt id={tab.slug} />
                    <span>{tab.title}</span>
                  </>
                )
              : undefined
          }
        />
        <div className="sx-bar-end">
          <Link to={DEBUGGER_PATH} className="sx-bar-link">
            <BugIcon />
            <span>Debugger</span>
          </Link>
          <HelpDialog topic={topic} />
        </div>
      </header>

      <main id="main" className="sx-work">
        <h1 className="sx-visually-hidden">{topic.title} visualiser</h1>
        <OperationPad visualiser={visualiser} />

        <div className="sx-view">
          <Stage
            stage={stage}
            kind={topic.kind}
            label={`${topic.title} drawing`}
            emptyState={<p>Nothing here yet.</p>}
          >
            <div className="sx-data">
              <Button className="sx-chip" onClick={visualiser.generate}>
                <ShuffleIcon />
                New {topic.noun}
              </Button>
              <Button className="sx-chip" onClick={visualiser.clear}>
                <ClearIcon />
                Clear
              </Button>
            </div>
            <ZoomControls stage={stage} />
          </Stage>
          <div className="sx-dock">
            <Transport visualiser={visualiser} tooltipSide="top" />
            <Scrubber visualiser={visualiser} />
            <StepCount visualiser={visualiser} />
            <SpeedSelect visualiser={visualiser} />
          </div>
        </div>

        <aside className="sx-codepanel" aria-labelledby={codeTitle}>
          <header className="sx-codepanel-head">
            <h2 id={codeTitle}>Code</h2>
            {visualiser.current ? (
              <code>{formatCall(visualiser.current.command, visualiser.current.args)}</code>
            ) : null}
          </header>
          <CodePanel
            visualiser={visualiser}
            placeholder="Run an operation to see its C code here."
          />
        </aside>
      </main>
    </DemoFrame>
  );
};

/** The visualiser page. Every demo shares this structure and dresses it with its own stylesheet. */
export const Workspace = ({ config }: { config: WorkspaceConfig }) => {
  const topic = useTopicParam();
  if (!topic) {
    return (
      <DemoFrame className={config.className}>
        <MissingTopic base={config.base} />
      </DemoFrame>
    );
  }
  return <Workbench key={topic.slug} topic={topic} config={config} />;
};
