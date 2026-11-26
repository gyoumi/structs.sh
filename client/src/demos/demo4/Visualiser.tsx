import { Workspace, type WorkspaceConfig } from '../shared/Workspace';
import { PALETTE } from './palette';
import './demo4.css';

const config: WorkspaceConfig = {
  base: '/4',
  className: 'd4',
  palette: PALETTE,
  tabArt: true,
  insets: { top: 64, right: 64, bottom: 88, left: 32 },
};

const Visualiser = () => <Workspace config={config} />;

export default Visualiser;
