import { Challenge, challengeTitle } from './challenge';
import styles from './Daily.module.css';

type Intro = { title: string; lede: string; rule: string };

const passes = (count: number) => `${count} ${count === 1 ? 'pass' : 'passes'}`;

const introFor = (challenge: Challenge): Intro => {
  switch (challenge.template) {
    case 'linked-list-index-drift':
      return {
        title: 'Rebuild the list',
        lede: 'Turn the start list into the target list with insert and delete by index.',
        rule: 'Cost is operations + nodes walked. Lower wins.',
      };
    case 'bubble-exact-passes':
      return {
        title: 'Land bubble sort on time',
        lede: `Swap the numbers so bubble sort takes exactly ${passes(challenge.targetPasses)}.`,
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

/** The challenge's heading and rules, with the streak badge when a streak is running. */
export const ChallengeIntro = ({
  challenge,
  streak,
}: {
  challenge: Challenge;
  streak?: number;
}) => {
  const { title, lede, rule } = introFor(challenge);
  return (
    <>
      <div className={styles.introHeader}>
        <div className={styles.eyebrow}>
          {`Daily #${challenge.number}${challenge.date ? ` · ${challenge.date}` : ''} · ${challengeTitle(
            challenge.template
          )}`}
        </div>
        {streak !== undefined && streak > 0 && (
          <output aria-label="Streak" className={styles.streakBadge}>
            {streak} {streak === 1 ? 'day' : 'days'} 🔥
          </output>
        )}
      </div>
      <h1 className={styles.title}>{title}</h1>
      <section aria-label="Challenge rules" className={styles.rules}>
        <p className={styles.lede}>{lede}</p>
        <p>{rule}</p>
        {challenge.template !== 'linked-list-index-drift' && (
          <details className={styles.keys}>
            <summary>Keyboard controls</summary>
            <p>
              Press Enter or Space to pick a number. Use Left or Right to swap it with the next
              unlocked one, or Tab to another and press Enter or Space to swap. Escape clears the
              selection.
            </p>
          </details>
        )}
      </section>
    </>
  );
};
