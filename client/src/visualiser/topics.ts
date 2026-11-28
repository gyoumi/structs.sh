import type { HashSlot } from '@/Services/challenges/challenges';
import {
  decodeHashTableShare,
  encodeHashTableSlots,
  HASH_TABLE_CAPACITY,
  isValidLinearProbingSlots,
} from '@/visualiser-src/hash-table-visualiser/util/shareEncoding';

export type TopicSlug =
  | 'linked-lists'
  | 'binary-search-trees'
  | 'avl-trees'
  | 'sorting-algorithms'
  | 'hash-tables';

export interface Topic {
  slug: TopicSlug;
  title: string;
  name: string;
  /** Lower-case noun for running text, e.g. "Add to the array". */
  noun: string;
  description: string;
  /** The label for each of the engine's commands. */
  operations: Record<string, string>;
  /** Whether the topic runs its operations in the challenges wasm, which must load before drawing. */
  requiresWasm?: boolean;
}

export const topics: Topic[] = [
  {
    slug: 'linked-lists',
    title: 'Linked Lists',
    name: 'Linked list',
    noun: 'linked list',
    description:
      'A chain of nodes where each one points to the next. Every insert, search and delete starts at the head and follows the pointers one node at a time.',
    operations: {
      append: 'Append',
      prepend: 'Prepend',
      insert: 'Insert at index',
      search: 'Search',
      delete: 'Delete at index',
    },
  },
  {
    slug: 'binary-search-trees',
    title: 'Binary Search Trees',
    name: 'Binary search tree',
    noun: 'binary search tree',
    description:
      'Each node keeps smaller values on its left and larger values on its right, so finding a value means following a single path down from the root.',
    operations: {
      insert: 'Insert',
      delete: 'Delete',
      rotateLeft: 'Rotate left',
      rotateRight: 'Rotate right',
      inorderTraversal: 'In-order',
      preorderTraversal: 'Pre-order',
      postorderTraversal: 'Post-order',
    },
  },
  {
    slug: 'avl-trees',
    title: 'AVL Trees',
    name: 'AVL tree',
    noun: 'AVL tree',
    description:
      'A binary search tree that rotates its nodes after every insert and delete, keeping the two sides of every node within one level of each other.',
    operations: {
      insert: 'Insert',
      delete: 'Delete',
      inorderTraversal: 'In-order',
      preorderTraversal: 'Pre-order',
      postorderTraversal: 'Post-order',
    },
  },
  {
    slug: 'sorting-algorithms',
    title: 'Sorting Algorithms',
    name: 'Sorting',
    noun: 'array',
    description:
      'Bubble, insertion, selection, merge and quick sort, each run on the same array so you can compare how they move the values into order.',
    operations: {
      append: 'Add values',
      delete: 'Remove values',
      bubble: 'Bubble sort',
      insertion: 'Insertion sort',
      selection: 'Selection sort',
      merge: 'Merge sort',
      quick: 'Quick sort',
    },
  },
  {
    slug: 'hash-tables',
    title: 'Hash Tables',
    name: 'Hash table',
    noun: 'hash table',
    description:
      'Eleven buckets where each key goes to bucket key % 11, probing to the next bucket past collisions and leaving a DEL tombstone behind when a key is deleted.',
    requiresWasm: true,
    operations: {
      insert: 'Insert',
      search: 'Search',
      delete: 'Delete',
    },
  },
];

export interface Destination {
  key: string;
  name: string;
  description: string;
  path: string;
}

export const debuggerDestination: Destination = {
  key: 'debugger',
  name: 'Debugger',
  description:
    'Run your own C code line by line and watch the linked lists and trees it builds get drawn as they change.',
  path: '/debugger',
};

/** Old links can have capitals in the topic, so it is matched case-insensitively. */
export const findTopic = (slug: string | undefined): Topic | undefined =>
  topics.find((topic) => topic.slug === slug?.toLowerCase());

export const operationLabel = (topic: Topic, command: string): string =>
  topic.operations[command] ?? command;

export const argLabel = (arg: string): string => {
  if (arg === 'values') return 'Values';
  if (arg === 'index') return 'Index';
  return 'Value';
};

export const randomValue = (): number => Math.floor(Math.random() * 100);

const EMPTY_DATA = 'empty';

const SLOT_KINDS = ['empty', 'tombstone', 'occupied'];

const isHashSlots = (state: unknown): state is HashSlot[] =>
  Array.isArray(state) &&
  state.length === HASH_TABLE_CAPACITY &&
  state.every(
    (slot: unknown) =>
      typeof slot === 'object' &&
      slot !== null &&
      SLOT_KINDS.includes((slot as { kind?: unknown }).kind as string)
  );

/**
 * A link that reopens the structure as it stands: every bucket for a hash table, otherwise the
 * values at two digits each, as `parseSharedData` reads them.
 */
export const shareLink = (slug: TopicSlug, state: unknown, origin: string): string => {
  if (slug === 'hash-tables' && isHashSlots(state)) {
    return `${origin}/visualiser/${slug}/${encodeHashTableSlots(state)}`;
  }
  const data = state as number[];
  const encoded =
    data.length > 0 ? data.map((value) => String(value).padStart(2, '0')).join('') : EMPTY_DATA;
  return `${origin}/visualiser/${slug}/${encoded}`;
};

/** The values in a link's data segment: `[]` for an empty structure, undefined to start with random values. */
export const parseSharedData = (segment: string | undefined): number[] | undefined => {
  if (segment === EMPTY_DATA) return [];
  const data = (segment?.match(/.{2}/g) ?? [])
    .map((chunk) => parseInt(chunk, 10))
    .filter(Number.isFinite);
  return data.length > 0 ? data : undefined;
};

/** What a link starts the structure on: values to load, or a whole state to restore. */
export type SharedInitial = number[] | { state: unknown };

/** The start a link's data segment asks for, or undefined to start with random values. */
export const parseSharedInitial = (
  slug: TopicSlug,
  segment: string | undefined
): SharedInitial | undefined => {
  if (slug !== 'hash-tables') return parseSharedData(segment);
  const share = decodeHashTableShare(segment);
  if (!share) return undefined;
  if (share.kind === 'slots') {
    return isValidLinearProbingSlots(share.slots) ? { state: share.slots } : undefined;
  }
  return share.keys;
};
