import type { VisualiserPalette } from '@/visualiser-src/common/palette';
import { Workspace, type WorkspaceConfig } from '../shared/Workspace';
import './demo2.css';

const PALETTE: Partial<VisualiserPalette> = {
  ink: '#e7e6f7',
  nodeFill: '#1c1a45',
  onHighlight: '#12102e',
  highlight: '#6fd3b4',
  danger: '#f0787e',
  listHighlight: '#e9c98a',
  listAlert: '#f0787e',
  pointer: '#8aa7ff',
  comparing: '#e9c98a',
  selected: '#c79bf2',
  sortAlert: '#f0787e',
  currFill: '#6fd3b4',
  currStroke: '#4fb396',
  prevFill: '#f0787e',
  prevStroke: '#d85b62',
  fontFamily: "'JetBrains Mono Variable', monospace",
};

const config: WorkspaceConfig = {
  base: '/2',
  className: 'd2',
  palette: PALETTE,
};

const Visualiser = () => <Workspace config={config} />;

export default Visualiser;
