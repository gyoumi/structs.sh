export type TopicSlug = 'linked-lists' | 'binary-search-trees' | 'avl-trees' | 'sorting-algorithms';

export interface TopicInfo {
  slug: TopicSlug;
  title: string;
  name: string;
  /** Lower-case noun for running text, e.g. "Add to the array". */
  noun: string;
  description: string;
  /** The label for each of the engine's commands. */
  operations: Record<string, string>;
}

export const topics: TopicInfo[] = [
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
];

export interface Destination {
  key: string;
  name: string;
  description: string;
}

export const debuggerDestination: Destination & { path: string } = {
  key: 'debugger',
  name: 'Debugger',
  description:
    'Run your own C code line by line and watch the linked lists and trees it builds get drawn as they change.',
  path: '/debugger',
};

/** Old links can have capitals in the topic, so it is matched case-insensitively. */
export const findTopic = (slug: string | undefined): TopicInfo | undefined =>
  topics.find((topic) => topic.slug === slug?.toLowerCase());

export const operationLabel = (topic: TopicInfo, command: string): string =>
  topic.operations[command] ?? command;

export const argLabel = (arg: string): string => {
  if (arg === 'values') return 'Values';
  if (arg === 'index') return 'Index';
  return 'Value';
};

export const randomValue = (): number => Math.floor(Math.random() * 100);

const EMPTY_DATA = 'empty';

/** A link that reopens the structure with the same values: two digits each, as `parseSharedData` reads them. */
export const shareLink = (slug: TopicSlug, data: number[], origin: string): string => {
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
