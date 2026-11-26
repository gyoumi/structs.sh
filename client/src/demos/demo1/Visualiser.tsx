import type { VisualiserPalette } from '@/visualiser-src/common/palette';
import { Workspace, type WorkspaceConfig } from '../shared/Workspace';
import './demo1.css';

const PALETTE: Partial<VisualiserPalette> = {
  ink: '#1b1a4b',
  nodeFill: '#ffffff',
  onHighlight: '#ffffff',
  highlight: '#16875a',
  danger: '#cf3423',
  listHighlight: '#3f3ab8',
  listAlert: '#cf3423',
  pointer: '#3f3ab8',
  comparing: '#d98e00',
  selected: '#8a5cc7',
  sortAlert: '#cf3423',
  currFill: '#bfe9d6',
  currStroke: '#16875a',
  prevFill: '#f6c4be',
  prevStroke: '#cf3423',
  fontFamily: "'JetBrains Mono Variable', monospace",
};

const config: WorkspaceConfig = {
  base: '/1',
  className: 'd1',
  palette: PALETTE,
  inkNumbers: true,
};

const Visualiser = () => <Workspace config={config} />;

export default Visualiser;
