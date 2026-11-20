import { ChevronDownIcon } from '@radix-ui/react-icons';
import { useState } from 'react';
import styles from '@/styles/Configuration.module.css';
import { useGlobalStore } from '@/visualiser-debugger/Store/globalStateStore';
import { MotionCollapse } from './MotionCollapse';
import { TypeAnnotation } from './TypeAnnotation';
import { StackVarAnnotation } from './StackVarAnnotation';

const Configuration = () => {
  const [isTypeAnnotationOpen, setIsAnnotationOpen] = useState(true);
  const [isVariableAnnotationOpen, setIsVariableAnnotationOpen] = useState(true);
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
      <div>
        <button
          onClick={() => setIsAnnotationOpen(!isTypeAnnotationOpen)}
          type="button"
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              setIsAnnotationOpen(!isTypeAnnotationOpen);
            }
          }}
        >
          <ChevronDownIcon
            fontWeight="bold"
            style={{
              transform: `rotate(${isTypeAnnotationOpen ? 180 : 0}deg)`,
              transition: 'transform 0.3s',
              marginRight: '10px',
              scale: '1.35',
            }}
          />
          Types
        </button>

        <MotionCollapse isOpen={isTypeAnnotationOpen}>
          {isTypeAnnotationOpen ? (
            <div className={styles.indentedAnnotationArea}>
              {typeDeclarations.map((declaration, index) => (
                <TypeAnnotation typeDeclaration={declaration} key={index} />
              ))}
            </div>
          ) : null}
        </MotionCollapse>
      </div>

      <div>
        <button
          onClick={() => setIsVariableAnnotationOpen(!isVariableAnnotationOpen)}
          type="button"
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              setIsVariableAnnotationOpen(!isVariableAnnotationOpen);
            }
          }}
        >
          <ChevronDownIcon
            fontWeight="bold"
            style={{
              transform: `rotate(${isVariableAnnotationOpen ? 180 : 0}deg)`,
              transition: 'transform 0.3s',
              marginRight: '10px',
              scale: '1.35',
            }}
          />
          Stack Variable
        </button>

        <MotionCollapse isOpen={isVariableAnnotationOpen}>
          {isVariableAnnotationOpen ? (
            <div className={styles.indentedAnnotationArea}>
              {Object.entries(latestProgramState.stack_data).map(([name, memoryValue]) => (
                <StackVarAnnotation key={name} name={name} memoryValue={memoryValue} />
              ))}
            </div>
          ) : null}
        </MotionCollapse>
      </div>
    </div>
  );
};

export default Configuration;
