import { KeyboardEvent, useState } from 'react';
import type { ListOperation } from '@/Services/puzzles/puzzles';
import styles from './OperationBuilder.module.css';

type Kind = ListOperation['kind'];

type Draft = { kind: Kind; value: string; index: string };

const MIN_I32 = -0x80000000;
const MAX_I32 = 0x7fffffff;

const integerIn = (raw: string, min: number, max: number): number | null => {
  if (!/^-?\d+$/.test(raw.trim())) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
};

const lengthAfter = (start: number, operations: ListOperation[]) =>
  operations.reduce((length, op) => length + (op.kind === 'insert' ? 1 : -1), start);

/** The operation `draft` describes, or why it can't be added yet. */
const operationOf = (draft: Draft, length: number): ListOperation | { invalid: string } => {
  const index = integerIn(draft.index, 0, MAX_I32);
  if (draft.kind === 'delete') {
    if (length === 0) return { invalid: 'The list is empty, so there is nothing to delete.' };
    if (index === null || index >= length) {
      return { invalid: `Delete takes an index from 0 to ${length - 1}.` };
    }
    return { kind: 'delete', index };
  }
  const value = integerIn(draft.value, MIN_I32, MAX_I32);
  if (value === null) return { invalid: 'Insert takes a whole-number value.' };
  if (index === null) return { invalid: 'Insert takes an index of 0 or more.' };
  return { kind: 'insert', value, index };
};

/** `insert(5, 2)` or `delete(0)`, as the operation list shows it. */
export const describeOperation = (op: ListOperation) =>
  op.kind === 'insert' ? `insert(${op.value}, ${op.index})` : `delete(${op.index})`;

const ListRow = ({ label, values }: { label: string; values: number[] }) => (
  <div className={styles.listRow}>
    <h3 className={styles.listLabel}>{label}</h3>
    <ol aria-label={label} className={styles.chain}>
      {values.map((value, index) => (
        <li key={index} className={styles.link}>
          <span className={styles.node}>{value}</span>
        </li>
      ))}
    </ol>
    {values.length === 0 && <span className={styles.empty}>empty</span>}
  </div>
);

type Props = {
  start: number[];
  target: number[];
  operations: ListOperation[];
  /** Locks the builder, as while a run animates or once the tries are used up. */
  frozen: boolean;
  onChange: (operations: ListOperation[]) => void;
};

/** The start and target lists, and the inserts and deletes the player builds to turn one into the other. */
export const OperationBuilder = ({ start, target, operations, frozen, onChange }: Props) => {
  const [draft, setDraft] = useState<Draft>({ kind: 'insert', value: '', index: '' });
  const length = lengthAfter(start.length, operations);
  const next = operationOf(draft, length);
  const blank = draft.index.trim() === '' || (draft.kind === 'insert' && draft.value.trim() === '');
  const hint = !blank && 'invalid' in next ? next.invalid : '';

  const add = () => {
    if (frozen || 'invalid' in next) return;
    onChange([...operations, next]);
    setDraft({ ...draft, value: '', index: '' });
  };

  const addOnEnter = (event: KeyboardEvent) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    add();
  };

  return (
    <div className={styles.builder}>
      <div className={styles.lists}>
        <ListRow label="Start list" values={start} />
        <ListRow label="Target list" values={target} />
      </div>
      <div className={styles.form}>
        <div role="group" aria-label="Operation builder" className={styles.controls}>
          <select
            aria-label="Operation"
            className={styles.field}
            value={draft.kind}
            disabled={frozen}
            onChange={(event) => setDraft({ ...draft, kind: event.target.value as Kind })}
          >
            <option value="insert">insert</option>
            <option value="delete">delete</option>
          </select>
          <span className={styles.paren} aria-hidden="true">
            (
          </span>
          {draft.kind === 'insert' && (
            <>
              <input
                type="number"
                aria-label="Value"
                placeholder="value"
                inputMode="numeric"
                className={`${styles.field} ${styles.number}`}
                value={draft.value}
                disabled={frozen}
                onChange={(event) => setDraft({ ...draft, value: event.target.value })}
                onKeyDown={addOnEnter}
              />
              <span className={styles.paren} aria-hidden="true">
                ,
              </span>
            </>
          )}
          <input
            type="number"
            aria-label="Index"
            placeholder="index"
            inputMode="numeric"
            min={0}
            className={`${styles.field} ${styles.number}`}
            value={draft.index}
            disabled={frozen}
            onChange={(event) => setDraft({ ...draft, index: event.target.value })}
            onKeyDown={addOnEnter}
          />
          <span className={styles.paren} aria-hidden="true">
            )
          </span>
          <button
            type="button"
            className={styles.add}
            disabled={frozen || 'invalid' in next}
            onClick={add}
          >
            Add operation
          </button>
        </div>
        <span aria-live="polite" className={styles.hint}>
          {hint}
        </span>
      </div>
      <div className={styles.opsZone}>
        <div className={styles.opsHead}>
          <h3 className={styles.listLabel}>Operations</h3>
          <button
            type="button"
            className={styles.clear}
            disabled={frozen || operations.length === 0}
            onClick={() => onChange([])}
          >
            Clear operations
          </button>
        </div>
        <ol aria-label="Operation list" className={styles.ops}>
          {operations.map((op, index) => (
            <li key={index} className={styles.op}>
              <code className={styles.opText}>{describeOperation(op)}</code>
              {!frozen && (
                <button
                  type="button"
                  className={styles.remove}
                  aria-label={`Remove ${describeOperation(op)}`}
                  onClick={() => onChange(operations.filter((_, i) => i !== index))}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ol>
        {operations.length === 0 && <span className={styles.empty}>No operations yet</span>}
      </div>
    </div>
  );
};
