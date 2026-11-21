import { FormEvent, useState } from 'react';
import { useMediaQuery, usePrefersReducedMotion, useSession, useSnapshot } from './useVisualiser';

const STACKED_LAYOUT_QUERY = '(max-width: 860px)';

const friendlyError = (message: string): string => {
  if (message.startsWith('Invalid arguments') || message === 'Argument(s) missing') {
    return 'Fill in every box first.';
  }
  if (message.includes('positive integer')) return 'Use whole numbers only.';
  if (message.includes('between 0 and 99')) return 'Values need to be between 0 and 99.';
  return message;
};

const isWholeNumbers = (arg: string, text: string): boolean =>
  arg.endsWith('s')
    ? text
        .split(/,| /g)
        .filter((part) => part !== '')
        .every((part) => /^\d+$/.test(part))
    : /^\d+$/.test(text);

const faultyBoxes = (error: string, args: string[], input: string[]): boolean[] => {
  let faulty = args.map(() => true);
  if (error === 'Fill in every box first.') {
    faulty = args.map((_, i) => (input[i] ?? '').trim() === '');
  } else if (error === 'Use whole numbers only.') {
    faulty = args.map((arg, i) => !isWholeNumbers(arg, input[i] ?? ''));
  } else if (error === 'Values need to be between 0 and 99.') {
    faulty = args.map((arg) => arg === 'value' || arg === 'values');
  }
  return faulty.some(Boolean) ? faulty : args.map(() => true);
};

export const maxIndexFor = (args: string[], size: number): number | undefined => {
  if (!args.includes('index')) return undefined;
  return args.includes('value') ? size : size - 1;
};

const indexError = (args: string[], input: string[], size: number): string => {
  const max = maxIndexFor(args, size);
  const index = input[args.indexOf('index')] ?? '';
  if (max === undefined || !/^\d+$/.test(index) || Number(index) <= max) return '';
  if (max < 0) return 'The list is empty, so there is nothing to remove.';
  return max === 0 ? 'Index needs to be 0.' : `Index needs to be between 0 and ${max}.`;
};

export const useOperation = (command: string) => {
  const session = useSession();
  const args = useSnapshot((s) => s.documentation[command]?.args) ?? [];
  const stacked = useMediaQuery(STACKED_LAYOUT_QUERY);
  const reducedMotion = usePrefersReducedMotion();
  const [values, setValues] = useState<string[]>(() => args.map(() => ''));
  const [error, setError] = useState('');
  const [invalid, setInvalid] = useState<boolean[]>([]);

  const setValue = (index: number, value: string) => {
    setValues((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
    setError('');
    setInvalid([]);
  };

  const run = (override?: string[]): boolean => {
    const input = override ?? args.map((_, i) => (values[i] ?? '').trim());
    const outOfRange = indexError(args, input, session.data.length);
    if (outOfRange) {
      setError(outOfRange);
      setInvalid(args.map((arg) => arg === 'index'));
      return false;
    }
    const message = session.run(command, input);
    if (message) {
      let friendly = friendlyError(message);
      if (friendly === 'Fill in every box first.' && input.every((text) => text.trim() !== '')) {
        friendly = 'Use whole numbers only.';
      }
      setError(friendly);
      setInvalid(faultyBoxes(friendly, args, input));
      return false;
    }
    setValues(args.map(() => ''));
    setError('');
    setInvalid([]);
    return true;
  };

  const revealDrawing = () => {
    if (!stacked) return;
    document.getElementById('visualiser-container')?.scrollIntoView({
      block: 'nearest',
      behavior: reducedMotion ? 'instant' : 'smooth',
    });
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (run()) revealDrawing();
  };

  return { args, values, setValue, error, invalid, run, onSubmit };
};
