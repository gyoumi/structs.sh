import { useState, type FormEvent } from 'react';
import { Button } from '@ui-sdk/react/button';
import { Field, FieldLabel } from '@ui-sdk/react/field';
import { Input } from '@ui-sdk/react/input';
import { Radio, RadioGroup } from '@ui-sdk/react/radio';
import { BackspaceIcon, DiceIcon } from './icons';
import { cx, useDomId } from './parts';
import type { Operation, Visualiser } from './useVisualiser';

const DIGITS = ['7', '8', '9', '4', '5', '6', '1', '2', '3'];

const argumentLabel = (name: string): string =>
  ({ value: 'Value', values: 'Values', index: 'Index' })[name] ?? name;

const argumentHint = (name: string): string =>
  ({ value: '0–99', values: '4, 15, 8', index: '0' })[name] ?? '';

const randomValue = (): string => String(Math.floor(Math.random() * 100));

interface PadFormProps {
  visualiser: Visualiser;
  operation: Operation;
}

/** The fields, number keys and run button for one operation. */
const PadForm = ({ visualiser, operation }: PadFormProps) => {
  const { args } = operation;
  const [values, setValues] = useState<string[]>(() => args.map(() => ''));
  const [error, setError] = useState('');
  const [active, setActive] = useState(0);
  const takesList = args[active] === 'values';
  // A touch keyboard would cover the keys that are already on screen.
  const [touch] = useState(() => window.matchMedia('(pointer: coarse)').matches);

  const setValue = (index: number, value: string) => {
    setError('');
    setValues((current) => current.map((item, at) => (at === index ? value : item)));
  };

  const press = (key: string) => {
    const current = values[active] ?? '';
    if (key === ',') {
      if (!current || current.trimEnd().endsWith(',')) return;
      setValue(active, `${current}, `);
      return;
    }
    if (!takesList && current.length >= 2) {
      // A full field moves on to the next one, the way a keypad lock would.
      if (active < args.length - 1 && !values[active + 1]) {
        setActive(active + 1);
        setValue(active + 1, key);
      }
      return;
    }
    setValue(active, current + key);
  };

  const backspace = () => setValue(active, (values[active] ?? '').trimEnd().slice(0, -1));

  const random = () => {
    setError('');
    setValues((current) =>
      current.map((item, at) => {
        if (args[at] === 'value') return randomValue();
        if (args[at] === 'values') return [randomValue(), randomValue(), randomValue()].join(', ');
        return item;
      })
    );
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const problem = visualiser.run(operation.command, values);
    setError(problem);
    if (problem) return;
    setValues(args.map(() => ''));
    setActive(0);
  };

  return (
    <form className="sx-pad-form" onSubmit={submit} noValidate>
      {args.length > 0 ? (
        <>
          <div className="sx-pad-fields">
            {args.map((name, index) => (
              <Field key={name} className="sx-field" invalid={error ? true : undefined}>
                <FieldLabel className="sx-field-label">{argumentLabel(name)}</FieldLabel>
                <Input
                  className="sx-input"
                  value={values[index]}
                  inputMode={touch ? 'none' : name === 'values' ? 'text' : 'numeric'}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={argumentHint(name)}
                  data-active={(args.length > 1 && index === active) || undefined}
                  onFocus={() => setActive(index)}
                  onValueChange={(value) => setValue(index, value)}
                />
              </Field>
            ))}
          </div>
          <div className="sx-keys" role="group" aria-label="Number keys">
            {DIGITS.map((digit) => (
              <Button key={digit} className="sx-key" onClick={() => press(digit)}>
                {digit}
              </Button>
            ))}
            {takesList ? (
              <Button className="sx-key" aria-label="Comma" onClick={() => press(',')}>
                ,
              </Button>
            ) : (
              <Button
                className="sx-key"
                data-key="random"
                aria-label="Random value"
                onClick={random}
                disabled={!args.includes('value')}
              >
                <DiceIcon />
              </Button>
            )}
            <Button className="sx-key" onClick={() => press('0')}>
              0
            </Button>
            <Button className="sx-key" data-key="delete" aria-label="Delete" onClick={backspace}>
              <BackspaceIcon />
            </Button>
          </div>
        </>
      ) : null}
      <Button type="submit" className="sx-run">
        Run {operation.label.toLowerCase()}
      </Button>
      <p className="sx-pad-error" role="status">
        {error}
      </p>
    </form>
  );
};

interface OperationPadProps {
  visualiser: Visualiser;
  className?: string;
}

/** Every operation for the structure, with a number pad to give the chosen one its values. */
export const OperationPad = ({ visualiser, className }: OperationPadProps) => {
  const { operations } = visualiser;
  const titleId = useDomId('sx-pad');
  const [chosen, setChosen] = useState<string | null>(null);
  const operation = operations.find((item) => item.command === chosen) ?? operations[0];

  return (
    <aside className={cx('sx-pad', className)} aria-labelledby={titleId}>
      <h2 id={titleId} className="sx-pad-title">
        Operations
      </h2>
      {operation ? (
        <>
          <RadioGroup
            className="sx-ops"
            aria-labelledby={titleId}
            value={operation.command}
            onValueChange={(value) => {
              if (value) setChosen(value);
            }}
          >
            {operations.map((item) => (
              <Radio key={item.command} value={item.command} className="sx-op">
                {item.label}
              </Radio>
            ))}
          </RadioGroup>
          <PadForm key={operation.command} visualiser={visualiser} operation={operation} />
        </>
      ) : null}
    </aside>
  );
};
