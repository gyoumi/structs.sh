import { Toolbar, ToolbarButton } from '@ui-sdk/react/toolbar';
import { FitIcon, MinusIcon, PlusIcon } from '@/ui/icons';
import { StageView } from './Stage';
import styles from './ZoomControls.module.css';

const ZoomControls = ({ view }: { view: StageView }) => (
  <Toolbar className={styles.zoom} aria-label="Zoom" orientation="vertical">
    <ToolbarButton className={styles.zoomButton} onClick={view.zoomIn} aria-label="Zoom in">
      <PlusIcon size={18} />
    </ToolbarButton>
    <ToolbarButton className={styles.zoomButton} onClick={view.fit} aria-label="Fit to screen">
      <FitIcon size={18} />
    </ToolbarButton>
    <ToolbarButton className={styles.zoomButton} onClick={view.zoomOut} aria-label="Zoom out">
      <MinusIcon size={18} />
    </ToolbarButton>
  </Toolbar>
);

export default ZoomControls;
