import { FormEvent, useState } from 'react';
import { useSession, useSnapshot } from './useVisualiser';

const friendlyError = (message: string): string => {
  if (message.startsWith('Invalid arguments') || message === 'Argument(s) missing') {
    return 'Fill in every box first.';
  }
  if (message.includes('positive integer')) return 'Use whole numbers only.';
  if (message.includes('between 0 and 99')) return 'Values need to be between 0 and 99.';
  return message;
};

/** An insert can land just past the last node, while a delete needs a node at the index. */
export const indexMaxFor = (args: string[], size: number): number | undefined => {
  if (!args.includes('index')) return undefined;
  return args.includes('value') ? size : size - 1;
};

const indexError = (args: string[], input: string[], size: number): string => {
  const max = indexMaxFor(args, size);
  const index = input[args.indexOf('index')] ?? '';
  if (max === undefined || !/^\d+$/.test(index) || Number(index) <= max) return '';
  if (max < 0) return 'The list is empty, so there is nothing to remove.';
  return max === 0 ? 'Index needs to be 0.' : `Index needs to be between 0 and ${max}.`;
};

export const useOperation = (command: string) => {
  const session = useSession();
  const args = useSnapshot((s) => s.documentation[command]?.args) ?? [];
  const [values, setValues] = useState<string[]>(() => args.map(() => ''));
  const [error, setError] = useState('');

  const setValue = (index: number, value: string) => {
    setValues((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
    setError('');
  };

  const run = (override?: string[]): boolean => {
    const input = override ?? args.map((_, i) => (values[i] ?? '').trim());
    const message = indexError(args, input, session.data.length) || session.run(command, input);
    if (message) {
      setError(friendlyError(message));
      return false;
    }
    setValues(args.map(() => ''));
    setError('');
    return true;
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    run();
  };

  return { args, values, setValue, error, run, onSubmit };
};
