import { runHashTableStepLog } from '@/Services/challenges/challenges';
import type { HashOp, HashSlot } from '@/Services/challenges/challenges';
import GraphicalDataStructure from '@/visualiser-src/common/GraphicalDataStructure';
import { injectIds } from '@/visualiser-src/common/helpers';
import { Documentation } from '@/visualiser-src/common/typedefs';
import HashTableAnimationProducer from '../animation-producer/HashTableAnimationProducer';
import { idleBanner } from '../util/bannerText';
import { generateCollidingKeys } from '../util/generateKeys';
import { HASH_TABLE_CAPACITY } from '../util/shareEncoding';
import { drawHashTable } from './HashTableCanvas';

const SLOT_KINDS = ['empty', 'tombstone', 'occupied'];

const emptySlots = (): HashSlot[] =>
  Array.from({ length: HASH_TABLE_CAPACITY }, () => ({ kind: 'empty' }));

const copySlots = (slots: readonly HashSlot[]): HashSlot[] => slots.map((slot) => ({ ...slot }));

const isSlotList = (state: unknown): state is HashSlot[] =>
  Array.isArray(state) &&
  state.every(
    (slot: unknown) =>
      typeof slot === 'object' &&
      slot !== null &&
      SLOT_KINDS.includes((slot as { kind?: unknown }).kind as string)
  );

/** A linear-probing hash table of 11 buckets whose operations run in challenges.wasm. */
export default class GraphicalHashTable extends GraphicalDataStructure {
  private static documentation: Documentation = injectIds({
    insert: {
      args: ['value'],
      description: 'Insert a key, probing past full buckets',
    },
    search: {
      args: ['value'],
      description: 'Search for a key',
    },
    delete: {
      args: ['value'],
      description: 'Delete a key, leaving a DEL tombstone',
    },
  });

  private _slots: HashSlot[] = emptySlots();

  public constructor() {
    super();
    drawHashTable(this._slots, idleBanner());
  }

  public get documentation(): Documentation {
    return GraphicalHashTable.documentation;
  }

  public get slots(): HashSlot[] {
    return copySlots(this._slots);
  }

  public get data(): number[] {
    return this._slots.flatMap((slot) => (slot.kind === 'occupied' ? [slot.key] : []));
  }

  /** Inserts `values` in order into an empty table and draws the result. */
  public load(values: number[]): void {
    let slots = emptySlots();
    values.forEach((key) => {
      slots = runHashTableStepLog({
        capacity: HASH_TABLE_CAPACITY,
        slots,
        op: { kind: 'insert', key },
      }).slots;
    });
    this._slots = slots;
    drawHashTable(this._slots, idleBanner());
  }

  /** Draws exactly `slots`, keeping tombstones. */
  public loadSlots(slots: readonly HashSlot[]): void {
    if (slots.length !== HASH_TABLE_CAPACITY) {
      throw new Error(`A hash table has ${HASH_TABLE_CAPACITY} slots, got ${slots.length}.`);
    }
    this._slots = copySlots(slots);
    drawHashTable(this._slots, idleBanner());
  }

  public snapshotState(): HashSlot[] {
    return this.slots;
  }

  public restoreState(state: unknown): void {
    if (isSlotList(state)) {
      this.loadSlots(state);
      return;
    }
    super.restoreState(state);
  }

  public generate(): void {
    this.load(generateCollidingKeys());
  }

  public insert(value: number): HashTableAnimationProducer {
    return this.run({ kind: 'insert', key: value });
  }

  public search(value: number): HashTableAnimationProducer {
    return this.run({ kind: 'search', key: value });
  }

  public delete(value: number): HashTableAnimationProducer {
    return this.run({ kind: 'delete', key: value });
  }

  private run(op: HashOp): HashTableAnimationProducer {
    const beforeSlots = this.slots;
    const result = runHashTableStepLog({ capacity: HASH_TABLE_CAPACITY, slots: beforeSlots, op });
    this._slots = copySlots(result.slots);
    const producer = new HashTableAnimationProducer(drawHashTable(beforeSlots, idleBanner(op)), op);
    producer.playSteps(result.steps);
    return producer;
  }
}
