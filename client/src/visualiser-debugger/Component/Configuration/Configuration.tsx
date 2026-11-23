import { useGlobalStore } from '@/visualiser-debugger/Store/globalStateStore';
import { CollapsibleSection } from './CollapsibleSection';
import { TypeAnnotation } from './TypeAnnotation';
import { StackVarAnnotation } from './StackVarAnnotation';

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
      <CollapsibleSection title="Types">
        {typeDeclarations.map((declaration, index) => (
          <TypeAnnotation typeDeclaration={declaration} key={index} />
        ))}
      </CollapsibleSection>

      <CollapsibleSection title="Stack Variable">
        {Object.entries(latestProgramState.variables).map(([name, memoryValue]) => (
          <StackVarAnnotation key={name} name={name} memoryValue={memoryValue} />
        ))}
      </CollapsibleSection>
    </div>
  );
};

export default Configuration;
