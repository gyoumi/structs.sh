import { Link } from 'react-router-dom';
import logo from '@/assets/img/structs.png';
import { PlusIcon, PuzzleIcon, TerminalIcon } from '@/ui/icons';
import StructureArt from '@/ui/StructureArt';
import { ThemeMenuItem, ThemeToggle } from '@/ui/theme';
import StructureNav from './StructureNav';
import Shortcuts from './Shortcuts';
import { useMediaQuery } from './useVisualiser';
import { Topic } from './topics';
import styles from './VisualiserHeader.module.css';

const HEADER_COLLAPSE_QUERY = '(max-width: 560px)';

const VisualiserHeader = ({ topic }: { topic: Topic }) => {
  const collapsed = useMediaQuery(HEADER_COLLAPSE_QUERY);

  return (
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
        extraMenuItems={
          collapsed && (
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
        <span className={styles.actionText}>Debugger</span>
      </Link>
      <Link to="/daily" className={styles.daily}>
        <PuzzleIcon size={18} />
        <span className={styles.actionText}>Daily puzzle</span>
      </Link>
      <Shortcuts triggerClassName={`${styles.iconButton} ${styles.shortcuts}`} />
      {!collapsed && <ThemeToggle className={styles.iconButton} />}
    </header>
  );
};

export default VisualiserHeader;
