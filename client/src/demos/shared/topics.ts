import type { VisualiserPalette } from '@/visualiser-src/common/palette';

export interface OperationInfo {
  /** What the button says. */
  label: string;
  /** Values that make a good first run, one per argument. */
  example: string[];
}

export interface LegendEntry {
  colour: keyof VisualiserPalette;
  label: string;
}

export interface TopicInfo {
  slug: string;
  /** The title the engine's factory expects. */
  title: string;
  /** What a fresh one is called: "New linked list". */
  noun: string;
  /** A sentence or two for the landing page. */
  description: string;
  kind: 'list' | 'tree' | 'sort';
  /** What the structure starts with. Trees are given in preorder. */
  seed: number[];
  operations: Record<string, OperationInfo>;
  legend: LegendEntry[];
}

const traversals: Record<string, OperationInfo> = {
  inorderTraversal: {
    label: 'Inorder',
    example: [],
  },
  preorderTraversal: {
    label: 'Preorder',
    example: [],
  },
  postorderTraversal: {
    label: 'Postorder',
    example: [],
  },
};

const treeLegend: LegendEntry[] = [
  { colour: 'highlight', label: 'On the path, or visited' },
  { colour: 'danger', label: 'Not found, or being removed' },
];

export const topics: TopicInfo[] = [
  {
    slug: 'linked-lists',
    title: 'Linked Lists',
    noun: 'linked list',
    description:
      'A chain of nodes, each pointing to the next. Watch the pointers get rewired one at a time as nodes are added, found and removed.',
    kind: 'list',
    seed: [12, 27, 8, 41, 33],
    operations: {
      prepend: {
        label: 'Prepend',
        example: ['7'],
      },
      append: {
        label: 'Append',
        example: ['56'],
      },
      insert: {
        label: 'Insert',
        example: ['19', '2'],
      },
      search: {
        label: 'Search',
        example: ['41'],
      },
      delete: {
        label: 'Delete',
        example: ['1'],
      },
    },
    legend: [
      { colour: 'listHighlight', label: 'The node being looked at' },
      { colour: 'listAlert', label: 'Checked, not a match' },
      { colour: 'currFill', label: 'curr pointer' },
      { colour: 'prevFill', label: 'prev pointer' },
    ],
  },
  {
    slug: 'binary-search-trees',
    title: 'Binary Search Trees',
    noun: 'tree',
    description:
      'A tree that keeps smaller values on the left and larger values on the right. Follow the single path each operation takes down from the root.',
    kind: 'tree',
    seed: [50, 30, 20, 40, 70, 60, 80],
    operations: {
      insert: {
        label: 'Insert',
        example: ['65'],
      },
      delete: {
        label: 'Delete',
        example: ['30'],
      },
      rotateLeft: {
        label: 'Rotate left',
        example: ['50'],
      },
      rotateRight: {
        label: 'Rotate right',
        example: ['50'],
      },
      ...traversals,
    },
    legend: treeLegend,
  },
  {
    slug: 'avl-trees',
    title: 'AVL Trees',
    noun: 'tree',
    description:
      'A binary search tree that keeps itself balanced. See it rotate back into shape whenever one side grows too tall.',
    kind: 'tree',
    seed: [40, 20, 10, 30, 60, 50, 70],
    operations: {
      insert: {
        label: 'Insert',
        example: ['80'],
      },
      delete: {
        label: 'Delete',
        example: ['10'],
      },
      ...traversals,
    },
    legend: treeLegend,
  },
  {
    slug: 'sorting-algorithms',
    title: 'Sorting Algorithms',
    noun: 'array',
    description:
      'The classic ways of putting an array in order. Compare how each one moves the same bars into place.',
    kind: 'sort',
    seed: [42, 17, 68, 9, 55, 31, 76, 24],
    operations: {
      append: {
        label: 'Add values',
        example: ['63, 5'],
      },
      delete: {
        label: 'Remove values',
        example: ['9'],
      },
      bubble: {
        label: 'Bubble sort',
        example: [],
      },
      insertion: {
        label: 'Insertion sort',
        example: [],
      },
      selection: {
        label: 'Selection sort',
        example: [],
      },
      merge: {
        label: 'Merge sort',
        example: [],
      },
      quick: {
        label: 'Quicksort',
        example: [],
      },
    },
    legend: [
      { colour: 'comparing', label: 'Being compared' },
      { colour: 'selected', label: 'Picked out: a pivot or a minimum' },
      { colour: 'sortAlert', label: 'Out of place' },
      { colour: 'highlight', label: 'Sorted' },
    ],
  },
];

export interface Destination {
  key: string;
  title: string;
  description: string;
  /** Where "Open" goes. */
  to: string;
}

export const DEBUGGER_PATH = '/debugger';

/** Everything the landing page offers: each topic's visualiser under `base`, then the debugger. */
export const destinations = (base: string): Destination[] => [
  ...topics.map((topic) => ({
    key: topic.slug,
    title: topic.title,
    description: topic.description,
    to: `${base}/visualiser/${topic.slug}`,
  })),
  {
    key: 'debugger',
    title: 'Debugger',
    description:
      'Step through a C program of your own, line by line, and watch the data structures it builds take shape.',
    to: DEBUGGER_PATH,
  },
];

export const topicBySlug = (slug: string | undefined): TopicInfo | undefined =>
  topics.find((topic) => topic.slug === slug);

/** `append(56)`, the way the code panel would call it. */
export const formatCall = (command: string, args: string[]): string =>
  `${command}(${args.join(', ')})`;
