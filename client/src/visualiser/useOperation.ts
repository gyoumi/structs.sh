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
    const message = session.run(command, input);
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
