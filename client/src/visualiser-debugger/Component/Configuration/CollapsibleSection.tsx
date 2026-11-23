import { ChevronDownIcon } from '@radix-ui/react-icons';
import { ReactNode, useState } from 'react';
import styles from '@/styles/Configuration.module.css';
import { MotionCollapse } from './MotionCollapse';

export const CollapsibleSection = ({ title, children }: { title: string; children: ReactNode }) => {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        type="button"
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            setIsOpen(!isOpen);
          }
        }}
      >
        <ChevronDownIcon
          fontWeight="bold"
          style={{
            transform: `rotate(${isOpen ? 180 : 0}deg)`,
            transition: 'transform 0.3s',
            marginRight: '10px',
            scale: '1.35',
          }}
        />
        {title}
      </button>

      <MotionCollapse isOpen={isOpen}>
        {isOpen ? <div className={styles.indentedAnnotationArea}>{children}</div> : null}
      </MotionCollapse>
    </div>
  );
};
