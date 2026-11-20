import { Link } from 'react-router-dom';
import logo from '@/assets/img/structs.png';
import { PlusIcon, TerminalIcon } from '@/ui/icons';
import { ThemeToggle } from '@/ui/theme';
import StructureNav from './StructureNav';
import Shortcuts from './Shortcuts';
import { Topic } from './topics';
import styles from './VisualiserHeader.module.css';

const VisualiserHeader = ({ topic }: { topic: Topic }) => (
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
      }}
      renderLink={(t) => <span>{t.title}</span>}
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
    <Shortcuts triggerClassName={`${styles.iconButton} ${styles.shortcuts}`} />
    <ThemeToggle className={styles.iconButton} />
  </header>
);

export default VisualiserHeader;
