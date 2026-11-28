import { Text, Rect } from '@svgdotjs/svg.js';

export interface CodeLine {
  rectTarget: Rect;
  textTarget: Text;
}

export interface OperationUsage {
  args: string[];
  description: string;
  id?: number;
  noTimeline?: boolean;
  /** Whether the operations menu lists the command; `hidden` keeps out a command only other pages run. Shown when unset. */
  menu?: 'shown' | 'hidden';
}

export enum DataStructure {
  LINKED_LISTS = 'Linked Lists',
  BINARY_SEARCH_TREE = 'Binary Search Trees',
  AVL_TREE = 'AVL Trees',
  SORTING = 'Sorting Algorithms',
  HASH_TABLES = 'Hash Tables',
}

export interface Documentation {
  [command: string]: OperationUsage;
}
