export type TopicSlug =
  | 'linked-lists'
  | 'binary-search-trees'
  | 'avl-trees'
  | 'sorting-algorithms'
  | 'hash-tables';

export const topicTitles: Record<TopicSlug, string> = {
  'linked-lists': 'Linked Lists',
  'binary-search-trees': 'Binary Search Trees',
  'avl-trees': 'AVL Trees',
  'sorting-algorithms': 'Sorting Algorithms',
  'hash-tables': 'Hash Tables',
};

/** The label the UI shows for each engine command. */
export const operationLabels: Record<string, string> = {
  append: 'Append',
  prepend: 'Prepend',
  insert: 'Insert at index',
  search: 'Search',
  delete: 'Delete at index',
  rotateLeft: 'Rotate left',
  rotateRight: 'Rotate right',
  inorderTraversal: 'In-order',
  preorderTraversal: 'Pre-order',
  postorderTraversal: 'Post-order',
  bubble: 'Bubble sort',
  insertion: 'Insertion sort',
  selection: 'Selection sort',
  merge: 'Merge sort',
  quick: 'Quick sort',
};

/** Labels that differ by structure: a tree's or hash table's insert takes no index, and sorting adds whole lists. */
export const topicLabels: Partial<Record<TopicSlug, Record<string, string>>> = {
  'binary-search-trees': { insert: 'Insert', delete: 'Delete' },
  'avl-trees': { insert: 'Insert', delete: 'Delete' },
  'sorting-algorithms': { append: 'Add values', delete: 'Remove values' },
  'hash-tables': { insert: 'Insert', delete: 'Delete' },
};
