import { ReactNode, useState } from 'react';
import { Button } from '@ui-sdk/react/button';
import { Input } from '@ui-sdk/react/input';
import { Field, FieldLabel } from '@ui-sdk/react/field';
import { useOperation } from './useOperation';
import { argLabel, randomValue } from './topics';

export interface KeypadClasses {
  form?: string;
  fields?: string;
  field?: string;
  label?: string;
  input?: string;
  keys?: string;
  key?: string;
  submit?: string;
  error?: string;
}

interface KeypadProps {
  command: string;
  runLabel: ReactNode;
  classes: KeypadClasses;
  /** Largest index the operation accepts, so the index field can hint the real range. */
  indexMax?: number;
}

const DIGITS = ['7', '8', '9', '4', '5', '6', '1', '2', '3'];

const randomList = () => [randomValue(), randomValue(), randomValue()].join(',');

const rangeHint = (max: number) => {
  if (max < 0) return 'Empty';
  return max === 0 ? '0' : `0–${max}`;
};

const Keypad = ({ command, runLabel, classes, indexMax }: KeypadProps) => {
  const { args, values, setValue, error, onSubmit } = useOperation(command);
  const [active, setActive] = useState(0);
  const target = Math.min(active, Math.max(0, args.length - 1));
  const hasArgs = args.length > 0;
  const takesList = args[target] === 'values';

  const press = (key: string) => {
    const current = values[target] ?? '';
    if (key === ',' && (!current || current.endsWith(','))) return;
    if (args[target] === 'value' && current.length >= 2) return;
    setValue(target, current + key);
  };

  const placeholderFor = (arg: string) => {
    if (arg === 'values') return '12, 40, 7';
    if (arg === 'index' && indexMax !== undefined) return rangeHint(indexMax);
    return '0–99';
  };

  const backspace = () => setValue(target, (values[target] ?? '').slice(0, -1));

  const random = () => {
    args.forEach((arg, i) => {
      if (arg === 'values') setValue(i, randomList());
      else if (arg === 'value') setValue(i, String(randomValue()));
    });
  };

  return (
    <form className={classes.form} onSubmit={onSubmit} noValidate>
      {hasArgs && (
        <div className={classes.fields}>
          {args.map((arg, i) => (
            <Field key={arg} className={classes.field} invalid={error ? true : undefined}>
              <FieldLabel className={classes.label}>{argLabel(arg)}</FieldLabel>
              <Input
                className={classes.input}
                value={values[i] ?? ''}
                onValueChange={(value: string) => setValue(i, value)}
                onFocus={() => setActive(i)}
                data-active={(args.length > 1 && i === target) || undefined}
                inputMode={arg === 'values' ? 'text' : 'numeric'}
                autoComplete="off"
                placeholder={placeholderFor(arg)}
              />
            </Field>
          ))}
        </div>
      )}

      {hasArgs && (
        <div className={classes.keys} role="group" aria-label="Number keys">
          {DIGITS.map((digit) => (
            <Button key={digit} className={classes.key} onClick={() => press(digit)}>
              {digit}
            </Button>
          ))}
          {takesList ? (
            <Button className={classes.key} data-key="comma" onClick={() => press(',')}>
              ,
            </Button>
          ) : (
            <Button
              className={classes.key}
              data-key="random"
              onClick={random}
              disabled={!args.includes('value')}
            >
              Random
            </Button>
          )}
          <Button className={classes.key} onClick={() => press('0')}>
            0
          </Button>
          <Button
            className={classes.key}
            data-key="delete"
            onClick={backspace}
            aria-label="Delete last digit"
          >
            ⌫
          </Button>
        </div>
      )}

      <Button type="submit" className={classes.submit}>
        {runLabel}
      </Button>
      <p className={classes.error} role="status" aria-live="polite">
        {error}
      </p>
    </form>
  );
};

export default Keypad;
