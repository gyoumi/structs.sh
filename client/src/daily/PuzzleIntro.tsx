import { Puzzle, puzzleTitle } from './puzzle';
import styles from './Daily.module.css';

type Intro = { title: string; lede: string; rule: string };

const passes = (count: number) => `${count} ${count === 1 ? 'pass' : 'passes'}`;

const introFor = (puzzle: Puzzle): Intro => {
  switch (puzzle.template) {
    case 'bubble-exact-passes':
      return {
        title: 'Land bubble sort on time',
        lede: `Swap the numbers so bubble sort takes exactly ${passes(puzzle.targetPasses)}.`,
        rule: 'Hit that, then make as many swaps as you can.',
      };
    case 'insertion-beats-merge':
      return {
        title: 'Let insertion sort win',
        lede: 'Swap the numbers so insertion sort makes fewer comparisons than merge sort.',
        rule: 'Then score more out-of-order pairs.',
      };
    case 'avl-most-rotations':
      return {
        title: 'Keep the AVL tree spinning',
        lede: 'Swap the numbers so inserting them in order into an AVL tree makes as many rotations as possible.',
        rule: 'A double rotation counts as two.',
      };
    case 'bst-forced-order':
      return {
        title: 'Build the target tree',
        lede: 'Swap the numbers so inserting them in order into an empty BST builds the target tree.',
        rule: 'Then make the longest increasing run of numbers you can.',
      };
    case 'upset-bst-beats-avl':
      return {
        title: 'Let the BST win',
        lede: 'Swap the numbers so a plain BST passes fewer nodes than an AVL tree when both insert them in order.',
        rule: 'Score the gap. Only nodes passed on the way down count, not rotations.',
      };
    default:
      return {
        title: 'Make quicksort sweat',
        lede: 'Swap the numbers to make as many comparisons as possible.',
        rule: 'Leftmost number is always the pivot.',
      };
  }
};

export const PuzzleIntro = ({ puzzle }: { puzzle: Puzzle }) => {
  const { title, lede, rule } = introFor(puzzle);
  return (
    <>
      <div className={styles.eyebrow}>
        {`Daily #${puzzle.number}${puzzle.date ? ` · ${puzzle.date}` : ''} · ${puzzleTitle(
          puzzle.template
        )}`}
      </div>
      <h1 className={styles.title}>{title}</h1>
      <section aria-label="Puzzle rules" className={styles.rules}>
        <p className={styles.lede}>{lede}</p>
        <p>{rule}</p>
        <details className={styles.keys}>
          <summary>Keyboard controls</summary>
          <p>
            Press Enter or Space to pick a number. Use Left or Right to swap it with the next
            unlocked one, or Tab to another and press Enter or Space to swap. Escape clears the
            selection.
          </p>
        </details>
      </section>
    </>
  );
};
