import { ChevronDownIcon } from '@radix-ui/react-icons';
import { ReactNode, useState } from 'react';
import styles from '@/styles/Configuration.module.css';
import { useGlobalStore } from '@/visualiser-debugger/Store/globalStateStore';
import { MotionCollapse } from './MotionCollapse';
import { TypeAnnotation } from './TypeAnnotation';
import { StackVarAnnotation } from './StackVarAnnotation';

const Section = ({ title, children }: { title: string; children: ReactNode }) => {
  const [isOpen, setIsOpen] = useState(true);
  const toggle = () => setIsOpen((open) => !open);

  return (
    <div>
      <button
        onClick={toggle}
        type="button"
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            toggle();
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

const Configuration = () => {
  const { typeDeclarations } = useGlobalStore().visualizer;
  const { latestProgramState } = useGlobalStore();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '500px',
        gap: '0.8rem',
      }}
    >
      <Section title="Types">
        {typeDeclarations.map((declaration, index) => (
          <TypeAnnotation typeDeclaration={declaration} key={index} />
        ))}
      </Section>

      <Section title="Stack Variable">
        {Object.entries(latestProgramState.variables).map(([name, memoryValue]) => (
          <StackVarAnnotation key={name} name={name} memoryValue={memoryValue} />
        ))}
      </Section>
    </div>
  );
};

export default Configuration;
