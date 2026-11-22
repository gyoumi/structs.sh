import { KeyboardIcon } from '@/ui/icons';
import ShortcutsDialog from './ShortcutsDialog';
import styles from './Shortcuts.module.css';

const Shortcuts = ({ triggerClassName }: { triggerClassName: string }) => (
  <ShortcutsDialog
    trigger={<KeyboardIcon />}
    triggerClassName={triggerClassName}
    backdropClassName={styles.backdrop}
    contentClassName={styles.dialog}
    closeClassName={styles.dialogClose}
  />
);

export default Shortcuts;
