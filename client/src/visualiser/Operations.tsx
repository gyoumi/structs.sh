import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Radio, RadioGroup } from '@ui-sdk/react/radio';
import Keypad from './Keypad';
import { maxIndexFor } from './useOperation';
import { useSnapshot } from './useVisualiser';
import { operationLabel, Topic } from './topics';
import styles from './Operations.module.css';

const Operations = ({ topic }: { topic: Topic }) => {
  const documentation = useSnapshot((s) => s.documentation);
  const size = useSnapshot((s) => s.size);
  const commands = Object.keys(documentation);
  const [params] = useSearchParams();
  const requested = params.get('op');
  const [chosen, setChosen] = useState<string | null>(null);
  const fallback = requested && commands.includes(requested) ? requested : commands[0];
  const command = chosen ?? fallback;

  return (
    <section className={styles.ops} aria-labelledby="ops-title">
      <h2 id="ops-title" className={styles.panelTitle}>
        Operations
      </h2>
      <RadioGroup
        className={styles.opList}
        aria-labelledby="ops-title"
        value={command ?? null}
        onValueChange={(next: string | null) => next && setChosen(next)}
      >
        {commands.map((name) => (
          <Radio key={name} value={name} className={styles.op}>
            {operationLabel(topic, name)}
          </Radio>
        ))}
      </RadioGroup>

      {command && (
        <div className={styles.operationForm}>
          <Keypad
            key={command}
            command={command}
            runLabel={`Run ${operationLabel(topic, command).toLowerCase()}`}
            maxIndex={maxIndexFor(documentation[command].args, size)}
            classes={{
              form: styles.form,
              fields: styles.fields,
              field: styles.field,
              label: styles.label,
              input: styles.input,
              keys: styles.keys,
              key: styles.key,
              submit: styles.run,
              error: styles.error,
            }}
          />
        </div>
      )}
    </section>
  );
};

export default Operations;
