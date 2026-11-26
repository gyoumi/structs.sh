import type { VisualiserPalette } from '@/visualiser-src/common/palette';
import { Workspace, type WorkspaceConfig } from '../shared/Workspace';
import './demo5.css';

const PALETTE: Partial<VisualiserPalette> = {
  ink: '#1f1d5c',
  nodeFill: '#ffffff',
  onHighlight: '#1f1d5c',
  highlight: '#57c79a',
  danger: '#f2705f',
  listHighlight: '#7fb2e3',
  listAlert: '#f2705f',
  pointer: '#4a44a8',
  comparing: '#ecc98f',
  selected: '#7fb2e3',
  sortAlert: '#f2705f',
  currFill: '#ecc98f',
  currStroke: '#1f1d5c',
  prevFill: '#f6b3aa',
  prevStroke: '#1f1d5c',
  fontFamily: "'Fredoka Variable', sans-serif",
};

const config: WorkspaceConfig = {
  base: '/5',
  className: 'd5',
  palette: PALETTE,
  inkNumbers: true,
  tabArt: true,
};

const Visualiser = () => <Workspace config={config} />;

export default Visualiser;
