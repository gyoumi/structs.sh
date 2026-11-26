import type { VisualiserPalette } from '@/visualiser-src/common/palette';
import type { TopicInfo } from '../shared/topics';
import { Workspace, type WorkspaceConfig } from '../shared/Workspace';
import './demo3.css';

const INK = '#14113c';
const BLUE = '#2a66b3';
const VIOLET = '#7447c2';
const GREEN = '#12805c';
const GOLD = '#c98600';
const RED = '#cf4520';
const GREY = '#8a8fa8';

const common: Partial<VisualiserPalette> = {
  ink: INK,
  nodeFill: '#ffffff',
  onHighlight: '#ffffff',
  fontFamily: "'Overpass Variable', sans-serif",
  currFill: '#ffd98a',
  currStroke: GOLD,
  prevFill: '#d5d8e6',
  prevStroke: GREY,
};

/** Each structure draws in its own colour, the same one its tab and tile use. */
const palettes: Record<string, Partial<VisualiserPalette>> = {
  'linked-lists': { ...common, listHighlight: BLUE, listAlert: GREY },
  'binary-search-trees': { ...common, highlight: VIOLET, danger: RED },
  'avl-trees': { ...common, highlight: GREEN, danger: RED },
  'sorting-algorithms': {
    ...common,
    highlight: GREEN,
    comparing: GOLD,
    selected: BLUE,
    pointer: VIOLET,
    sortAlert: RED,
  },
};

const config: WorkspaceConfig = {
  base: '/3',
  className: 'd3',
  palette: (topic: TopicInfo) => palettes[topic.slug] ?? common,
  inkNumbers: true,
};

const Visualiser = () => <Workspace config={config} />;

export default Visualiser;
