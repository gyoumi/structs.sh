# Puzzle ideas

This is the list of templates for the daily game in `roadmap.md`. A template
is a kind of puzzle. The player designs an input, such as an array, an
insert order or a set of edge weights, that pushes an algorithm as far as
possible in one direction.

Each row gives the kind of puzzle, which direction wins, and what the
generator changes from day to day. A row joins the rotation only after it
passes the checks below on real instances.

## How a template qualifies

### Kinds

- **Extreme**: push a count as high or as low as it goes.
- **Disagree**: make two algorithms behave as differently as possible. An
  upset is a Disagree where the algorithm that's slower on average has to
  win. It's only an upset at sizes where that ranking holds, so the checks
  measure it: at 10 values, bubble sort already beats this quicksort on half
  of random arrays.
- **Break it**: make a flawed algorithm as wrong as possible on today's
  instance. A single smallest counterexample is the same every day, so it
  belongs in the practice library instead.
- **Exact target**: make the output come out exactly as given. Ties are
  broken by a second count when one fits, such as fewest rotations, and by
  time otherwise.
- **Budget**: the biggest effect from at most k changes.

### Rules

- **The answer has to depend on the instance.** A template whose answer
  follows one rule on every instance is left out, because once someone knows
  the rule it's the same puzzle every day.
- **A set of values isn't enough of an instance.** Sorts and trees react
  only to the order of the values, so any 8 distinct values behave like 1
  to 8. These templates add generated constraints, such as values fixed in
  place or given repeats.
- **The answer space has to be too big to click through.** Picking one key
  out of ten is a lookup, not a puzzle.

### The generator's checks

For each candidate instance, the generator finds the best score and sets the
goal 65% of the way from a typical random input's score to the best, then
runs three checks. The experiments in the tables below were run when "par"
meant the best score, not today's goal, so "par" there means the best.

1. **Is it solvable?** With fixed values, some instances have no answer at
   all. For example, between 8% and 30% of Insertion beats merge instances
   have no arrangement where insertion sort compares less. These are
   rerolled.
2. **Does a shortcut reach the best?** A shortcut is a rule you can apply without
   working through the instance, such as "insert the keys in preorder" or
   "fill the free slots in ascending order". Each template lists its known
   shortcuts. If one reaches the best, the instance is rerolled.
3. **How hard is it?** The bot player tries a random change and keeps it if
   the score didn't drop. If it reaches the goal often, the instance is easy.
   That sets its difficulty grade, not whether it ships. An algorithm you have
   to run on the instance, such as rebuilding a string from its KMP failure
   table, is the puzzle itself and counts here, not as a shortcut.

### Linked list costs

The linked list has no tail pointer. Each operation costs 1, plus every node
the animated pointer lands on:

| Operation | Cost |
|---|---|
| Delete at index i | 1 + (i + 1) |
| Insert at index 0 | 1 |
| Insert at any other index i | 1 + min(i, length) |
| Search | 1 + the nodes visited |

The per-operation cost matters. Without it, prepending is free, and every
edit is cheapest done by clearing the front of the list and prepending.

## Launch set

These seven were brute-forced at small sizes against the visualisers' own
code, with each listed shortcut tested.

| Template | Kind (wins) | Changes each day | Check result |
|---|---|---|---|
| **Index drift:** turn list A into list B with insert and delete by index | Exact target, then cost (lower) | Lists A and B | The cheap rebuild (delete from the front until the rest matches the end of B, then prepend) reached par in 37 of 223 instances. Reject instances where B equals A. |
| **Quicksort:** the most comparisons | Extreme (higher) | Values and fixed positions | Ascending, descending and zig-zag fills of the free slots reached par in 12 to 15 of 60 instances (n = 8 or 9, 2 or 3 values fixed) |
| **Forced order:** an insert order that builds the given BST with the longest increasing run | Exact target, then run length (higher) | The tree | Easy-day template. At n = 10, preorder reached par in 10% of instances and is a shortcut. The greedy "next larger key" order reached par in 40%, which only makes those instances easy. Par ranges from 4 to 7, so ties are common. Use n ≥ 10. |
| **AVL:** the most rotations from inserting today's keys | Extreme (higher) | Keys and fixed positions in the order | Sorted fills reached par in 1 or 2 of 40 instances (n = 8 or 9, 2 or 3 values fixed) |
| **Insertion beats merge:** the most out-of-order pairs while insertion sort still compares less than merge sort | Disagree (higher) | Values and fixed positions | Fills tried as shortcuts reached par in at most 2 instances per batch of 25 to 40. Needs the solvability check. |
| **Bubble:** exactly k passes, with the most swaps | Exact target, then swaps (higher) | k, values and fixed positions | Fixed values are required. Without them, "the k − 1 largest values first in descending order, then the rest ascending" solves every instance. With 2 or 3 fixed values it reached par in 0 to 3 of 17 to 19 solvable instances. About 40% of instances aren't solvable. |
| **Upset: the BST builds cheaper:** an insert order where building a plain BST passes fewer nodes than building an AVL tree, by the most | Disagree (higher) | Keys and fixed positions | Hard-day template, used sparingly. Use 14 keys with 6 fixed. Count nodes passed on the way down, not rotations: with rotations counted, the BST is already cheaper on 72% of random orders, and without them on 17% to 22%. No shortcut reached par, and 28 of 30 instances were winnable. The bot player reached par in a median of 48% of runs (0% on the hardest instances), against 88% to 92% for the quicksort and AVL templates. With 7 fixed it was 68%. |

The visualisers' rules the checks used: bubble sort stops after a pass with
no swaps, insertion sort stops when a value is at least the one before it,
merge sort splits at `floor(mid)` and takes from the left half on ties, and
quicksort's pivot is the first element of each range.

## Stage 1: more templates for today's visualisers

### Checked

These were brute-forced the same way as the launch set.

| Template | Kind (wins) | Changes each day | Check result |
|---|---|---|---|
| **Unbalanced wins:** an insert order where a plain BST beats an AVL tree by the most on today's searches | Disagree (higher) | Keys, and how often each is searched | Hot keys first, sorted orders, a greedy order and the optimal BST's preorder reached par in 4 of 30 instances at n = 7 and 1 of 10 at n = 8. Neither tree visualiser has a search operation, so the game page needs one. |
| **Quick crushes bubble:** the biggest margin by which quicksort compares less than bubble sort | Disagree (higher) | Values and fixed positions | Sorted and zig-zag fills, with and without the smallest value last, reached par in at most 1 of 30 instances (n = 9 or 10, 3 values fixed). In 19 of 30, the best arrangement for one sort isn't the best for the other. |
| **Quicksort:** the most swaps | Extreme (higher) | Values and fixed positions | The same fills reached par in at most 3 of 30. Par is small (3 to 7), but a median of 0.4% of arrangements reach it. Adding a recursion depth cap also passes, but isn't needed. |
| **Delete storm:** a delete order for 7 given keys with the most AVL rotations | Extreme (higher) | The tree and the keys | Use 14 to 16 nodes. About half the instances have par under 5 and are rerolled. Of the rest, sorted orders, depth orders and the greedy "delete whichever rotates most now" reached par in about 30%. Smaller and larger trees fail: a shortcut reached par in 27 of 40 kept instances at 12 nodes (6 keys), and 7 of 8 at 20 nodes. |
| **Upset: bubble beats quicksort** by the most comparisons | Disagree (higher) | Values and fixed positions | Use 14 values with 6 fixed. Bubble sort compares less on only 4% of random arrays at that size. 27 of 30 instances were winnable, and no shortcut reached par. Without fixed values, ascending order always wins. |
### Not checked yet

**Linked list**

| Template | Kind (wins) | Changes each day |
|---|---|---|
| **Sorted stream:** choose the order the given values arrive in, each inserted at its sorted place, so the total cost is exactly N | Exact target | Values, N, and which arrivals are fixed |
| **Search budget:** move at most k values (each move costs its delete and insert), then run today's searches | Budget (lower) | The list, 15 searches including misses, and k. Shortcut to test: move the most-searched values to the front. |

Sorted stream works only as an exact target. Each sorted insert walks one
node for each smaller value already in the list, so "the most walked" is
always solved by filling the free slots in ascending order.

**Sorting**

| Template | Kind (wins) | Changes each day |
|---|---|---|
| **Insertion:** exactly the given number of comparisons and swaps | Exact target | Both targets, values and fixed positions |
| **Selection:** the most changes to the smallest-so-far | Extreme (higher) | Values and fixed positions |
| **Selection is unstable:** with repeated values, reverse the most pairs of equal values | Break it (higher) | The repeated values and fixed positions |
| **Merge:** the most comparisons | Extreme (higher) | Values and fixed positions |
Counts that only measure out-of-order pairs, such as bubble sort's swaps or
insertion sort's shifts, are solved by filling the free slots in order. They
only appear alongside something that pulls the other way, such as "exactly k
passes" or "insertion still beats merge".

**BST** (delete promotes the smallest value of the right subtree)

| Template | Kind (wins) | Changes each day |
|---|---|---|
| **Rotation distance:** reach the target shape | Exact target, then rotations (lower) | Start and target trees |
| **Shrink it:** bring the height down to h | Budget (fewer deletes) | Tree and h |

**AVL tree**

| Template | Kind (wins) | Changes each day |
|---|---|---|
| **The most double rotations** from inserting today's keys | Extreme (higher) | Keys and fixed positions in the order |
| **Topple the root:** insert at most k keys from a pool to change the root the most times | Budget (higher) | Starting tree, pool and k |

## Stage 2: as each visualiser lands

**Today's visualisers, needing new game features**

| Template | Kind (wins) | Changes each day | Needs |
|---|---|---|---|
| **Pivot budget:** two swaps by hand, then quicksort runs | Budget (lower comparisons) | Starting array | Swapping by hand on the game page. Easy-day only: trying every swap and keeping the best reached par in 73% to 87% of instances (n = 9 to 12, 2 or 3 swaps). |
| **Rotate for speed:** at most 3 rotations, then today's searches run | Budget (lower cost) | Tree, and how often each key is searched | Rotating by hand on the game page. Easy-day only: the best single rotation, three times, reached par in 23 of 30 instances at n = 9 and 17 of 30 at n = 11. |

**Graphs with BFS** (track steps 1 to 3)

| Template | Kind (wins) | Changes each day |
|---|---|---|
| **Layer sizes:** add at most k edges so the BFS layers have exactly the given sizes | Exact target, then edges (lower) | Graph and layer sizes |
| **Long queue:** add k edges to make BFS's queue as long as possible | Budget (higher) | Graph and k |
| **DFS order:** the fewest added edges so DFS visits in the given order | Exact target, then edges (lower) | Graph and order |
| **Deep vs shallow:** add k edges so the DFS tree is as much deeper than the BFS tree as possible | Disagree (higher) | Graph and k |
| **Frontier race:** add or remove at most k edges so BFS from A reaches the most vertices before BFS from B | Budget (higher) | Graph, A, B and k. Shortcut to test: the best single edge change, k times. |
| **Missed by DFS:** add up to 3 edges so a depth-limited DFS that marks a node visited even when it has no steps left misses the most vertices BFS reaches within the limit | Break it (higher) | Graph, source, limit and the edges allowed. Shortcut to test: the best single edge, one at a time. |
| **Flip to a DAG:** reverse the fewest edges so DFS finds no back edges | Extreme (lower) | Directed graph. Shortcut to test: reversing the back edges one DFS finds, which always works but isn't always fewest. |

**Weights, direction and Dijkstra** (track steps 2 and 4)

| Template | Kind (wins) | Changes each day |
|---|---|---|
| **Dijkstra changes its mind:** weights that make it correct a distance as many times as possible | Extreme (higher) | Graph and weight set |
| **Fool BFS:** weights that make BFS's fewest-hops path as expensive as possible compared with the true shortest path | Disagree (higher) | Graph and weight set |
| **Critical weights:** change two weights to change the shortest-path tree the most | Budget (higher) | Weighted graph |
| **Stale entries:** the most outdated priority-queue entries, if the visualiser uses lazy deletion | Extreme (higher) | Graph and weight set |
| **Roadblock:** remove k edges to make the shortest path from S to T as long as possible | Budget (higher) | Weighted graph, S, T and k. Shortcut to test: cutting edges on the current shortest path. |

**More graph algorithms**

| Template | Kind (wins) | Changes each day |
|---|---|---|
| **Kahn's order:** the fewest edges that make Kahn's output the given order | Exact target, then edges (lower) | Order and fixed edges |
| **Kahn vs DFS:** add k edges so the two topological orders differ the most | Disagree (higher) | DAG and k |
| **Split the SCCs:** delete two edges for the most strongly connected components | Budget (higher) | Graph |
| **Strongly connect:** the fewest added edges that make the graph strongly connected | Exact target, then edges (lower) | Graph |
| **No bridges:** the fewest added edges that remove every bridge | Exact target, then edges (lower) | Graph |
| **Odd cycles:** delete the fewest edges to make the graph bipartite | Extreme (lower) | Graph |
| **Cheapest Euler:** pick new roads from priced options to make an Euler circuit | Budget (lower cost) | Graph and road prices |
| **Bellman-Ford passes:** order the edge list for the most passes | Extreme (higher) | Graph |
| **Poisoned weights:** assign a weight set with 2 negative weights and no negative cycle so Dijkstra's distances are as wrong as possible compared with Bellman-Ford's | Break it (higher) | Directed graph and weight set |
| **Busy Floyd-Warshall:** a vertex numbering with the most matrix updates | Extreme (higher) | Graph |
| **Wasteful A\*:** admissible heuristic values with the most expansions | Extreme (higher) | Graph or grid |
| **Overestimate:** with at most k total overestimate, make A\* return the worst path | Break it (higher) | Graph or grid, and k |
| **Prim vs Kruskal:** weights where they add edges in the most different order | Disagree (higher) | Graph and weight set |
| **Shake the MST:** change two weights to change the most MST edges | Budget (higher) | Weighted graph |
| **Unique MST:** assign the weight set so the given tree is the only MST | Exact target | Graph, tree and weight set. Some edges outside the tree come with small weights already set, and the weight set has repeats. |

**Later-year content** (track step 7)

| Template | Kind (wins) | Changes each day |
|---|---|---|
| **Capacity creep:** assign values so the best knapsack set changes the most as capacity rises | Extreme (higher) | Item weights and value set |
| **Ratio fails:** values where greedy by value-to-weight ratio is furthest below the DP answer | Break it (higher) | Item weights and value set |
| **Backtrack target:** values whose table traces back to exactly the given items | Exact target | Weights and target items |
| **Many LCSs:** write string B with the most distinct longest common subsequences against A | Extreme (higher) | String A, length and alphabet |
| **Greedy LCS:** write B so greedy matching is furthest from the true LCS | Break it (higher) | String A |
| **Many alignments:** the most optimal edit-distance alignments | Extreme (higher) | One string, length and alphabet |
| **Patience piles:** a sequence that leaves exactly the given piles | Exact target | The piles |
| **Bad brackets:** fill in matrix sizes so left-to-right multiplication costs the most compared with the best order | Disagree (higher) | Fixed sizes and size set |
| **Failure table:** a pattern with exactly the given KMP failure table, which may be impossible | Exact target | The table |
| **KMP fallbacks:** write a pattern with the most fallbacks on the text | Extreme (higher) | Text and length |
| **Z-array:** a string with exactly the given Z-array | Exact target | The array |
| **Spurious hits:** write a text with the most false Rabin-Karp matches | Extreme (higher) | Pattern and modulus |
| **Slow Ford-Fulkerson:** assign capacities for the most augmenting paths | Extreme (higher) | Network and capacity set |
| **Ford-Fulkerson vs Edmonds-Karp:** capacities where Edmonds-Karp saves the most iterations | Disagree (higher) | Network and capacity set |
| **Two upgrades:** raise two capacities to increase max flow the most | Budget (higher) | Network |
| **Exact cut:** capacities so the min cut is exactly the given edges | Exact target | Network, cut and capacity set, with some capacities fixed. Shortcut to test: the smallest capacities on the cut. |
| **No back edges:** capacities where a greedy flow with no residual edges stops furthest below max flow | Break it (higher) | Network and capacity set |
| **Greedy matching gap:** an edge order where greedy matching is furthest below the maximum | Break it (higher) | Bipartite graph |
| **Fooled by start time:** add 3 intervals so "earliest start first" is furthest below the best schedule | Break it (higher) | 6 given intervals |
| **Exact codes:** frequencies that give exactly the given Huffman tree | Exact target | The tree, with some frequencies fixed and the rest from a given set |
| **Lateness trap:** add jobs so "shortest first" is furthest from earliest-deadline-first | Break it (higher) | Given jobs |
| **Coin trap:** add 2 coins from a range to 3 given coins so greedy change uses the most extra coins over DP on today's 5 amounts | Break it (higher) | Coins, amounts and range |
| **KMP vs naive:** write a pattern of length m where naive matching makes the most extra comparisons over KMP on the text | Disagree (higher) | Text, m, and 1 or 2 fixed characters |
| **Many best packs:** assign the value set to the items so the most item sets tie for the best value | Extreme (higher) | Weights, capacity, value set and some fixed values. Shortcuts to test: values in proportion to weight, and the biggest values on the heaviest items. Reroll instances where no tie is possible. |

**Interview patterns** (track step 8)

| Template | Kind (wins) | Changes each day |
|---|---|---|
| **Busy search:** insert k values to make today's binary searches take the most probes in total | Budget (higher) | Array, queries and k |
| **Container trap:** fill the blank heights so "move the taller line" loses the most to the correct rule | Break it (higher) | Fixed heights |
| **Dutch flag:** arrange for the most three-way partition swaps | Extreme (higher) | Counts and fixed positions |
| **Busy window:** arrange values for the most left-pointer moves | Extreme (higher) | Values, K and fixed positions |
| **Prefix matches:** arrange values for the most subarrays summing to K | Extreme (higher) | Values and K |
| **Next greater:** an array with exactly the given next-greater output | Exact target | The output |
| **Window max churn:** arrange values for the most deque pops | Extreme (higher) | Values and window size |

**Beyond VisuAlgo** (track step 9)

| Template | Kind (wins) | Changes each day |
|---|---|---|
| **Heavy heapify:** arrange for the most build-heap swaps | Extreme (higher) | Values and fixed positions |
| **Insert vs heapify:** where inserting one at a time swaps the most beyond bottom-up build-heap | Disagree (higher) | Values and fixed positions |
| **Heap after pops:** an array that looks exactly as given after k pops | Exact target | Target array and k |
| **Cascade:** k decrease-keys for the most cascading cuts | Budget (higher) | Fibonacci heap state |
| **Fibonacci vs binary:** an operation order where the Fibonacci heap wins by the most | Disagree (higher) | The operation set |
| **Lazy cascade:** order the given updates for the most lazy pushes | Extreme (higher) | Updates and queries |
| **Heapsort:** the most comparisons, building the heap and extracting together | Extreme (higher) | Values and fixed positions |
| **Upset: inserting beats heapify:** an order where inserting one at a time compares less than bottom-up build-heap, by the most | Disagree (higher) | Values and fixed positions. Checked: a shortcut reached par in 1 of 30 instances at 10 values and 3 of 26 at 14, but par is only 1 to 5. |

Red-black vs AVL and Splay to shape also came up. They need visualisers that
aren't on the track yet.

**Hash tables, union-find, tries and caches** (track step 6)

| Template | Kind (wins) | Changes each day |
|---|---|---|
| **Pile-up:** add k keys for the longest probe chain | Budget (higher) | Partly filled table and key range |
| **Linear vs quadratic:** choose 6 keys from a pool so the two probing schemes' tables differ the most | Disagree (higher) | The pool |
| **Cuckoo cycle:** the fewest keys from a pool that force a rehash | Exact target, then keys (lower) | Pool, with each key's two slots |
| **Tall union-find:** order the given unions, and which root links to which, for the most find steps on today's queries | Extreme (higher) | The union pairs and queries |
| **Big compression:** k finds that compress the most nodes | Budget (higher) | The forest |
| **Small trie:** choose 8 words for the fewest nodes | Extreme (lower) | Word pool |
| **LRU blanks:** fill the blanks in an access sequence for the most misses | Extreme (higher) | Sequence and capacity |
| **Cache clash:** weave two request streams together, keeping each stream's order, so FIFO misses as many more times than LRU as possible | Disagree (higher) | Both streams and the cache size. Checked: alternating, one stream first, and greedy reached par in 3 of 38 instances (6 keys, streams of 7, cache of 3). Needs a FIFO cache next to LRU. The upset, filling blanks so LRU misses more than FIFO, also passed (2 of 30 at 5 keys). LRU only wins on average when the trace reuses recent keys, so the fixed accesses need to. |
| **LRU vs LFU:** fill the blanks in an access sequence so LRU misses as many more times than LFU as possible | Disagree (higher) | Capacity, keys and the fixed accesses. Needs an LFU cache with a stated tie rule. |
| **Tombstone maze:** delete and re-insert k keys in a linear-probing table so today's searches pass the most tombstones | Budget (higher) | Table, keys to insert, searches and k |
| **False positives:** choose 5 words for the most Bloom filter false positives | Extreme (higher) | Word pool and queries |

## Practice library

These are good lessons with a fixed answer, so they don't work as daily
puzzles. They fit a practice mode where each one is solved once.

- **One answer for each size:** Minimal AVL, Tall Huffman, Turtles, Merge
  max without fixed values, Shift by one, Many proposals, Slow gcd, Costly
  exponent, Belady's anomaly, Many orders, Resize storm, Expensive average,
  Two-stack queue, Carry chain, Deep Fibonacci heap, Tall stack, Slow
  quickselect, Slow interpolation, Bubble vs cocktail, Insertion vs
  selection, Busy queries.
- **One fixed counterexample:** Bracket fooler, Bad modulus, Greedy coins,
  Two-sum slip, Not monotone, Negatives break the window, XOR fails,
  Unsorted merge, the plain "Fooled by" interval puzzles, Hidden cycle,
  False cycle, Stuck walk, Median-of-3 killer, Plateau.
- **Too few answers to be a puzzle:** Deepest probe, Tune the filter.
- **Ordinary puzzles rather than pushing an algorithm:** XOR target, Hanoi
  state, Stubborn queens, Hard mini-sudoku.

## Code challenges

These show buggy code and ask for an input that exposes the bug. They need
the instrumenter to run the player's input through the buggy C, so they
belong with the code challenges in the roadmap's "Later":

Lose the list, Two-way mismatch, Off-by-one binary search, Bad sift-down,
Floyd-Warshall with the loops in the wrong order, Sparse table off-by-one,
Kadane bugs, Loops swapped, Stale max, Counting sort reversed, Radix break.

## Left out

| Idea | Why |
|---|---|
| Build it cheap (linked list) | Inserting at index 1 always costs the least, so one order solves every target list |
| Exact shape (BST) | Inserting the given tree's keys in preorder always rebuilds it |
| Lopsided deletes (BST) | Scored by height, never touching the longest path solves it. Scored by total depth, each delete's cost barely depends on the others, so deleting the cheapest node each time should reach par. |
| Two swaps (k swaps, then insertion sort runs) | Shifts equal the out-of-order pairs, so making the swaps that remove the most pairs solves it |
| Pass budget, Merge budget (k swaps, then bubble or merge sort runs) | The same mechanic as Pivot budget, but for these sorts a more sorted array is always cheaper, so the answer is close to "sort as much as you can" |
| Tortoise and hare | Needs cycles in the linked list visualiser, which aren't planned |
| Delete order (BST, fewest or most nodes visited) | Deleting the cheapest key each time reached par in 35 to 38 of 40 instances, and deepest first solved the "most visited" version in all 40 |
| Online hotlist (linked list: after each search, choose whether to move the node to the front) | A move from index i costs i + 3, so it rarely pays. Never moving, or moving only when later searches repay it, reached par in 59 of 60 instances |
| Delete cascade (AVL: insert from a pool, then one delete) | Replaced by Delete storm, which reaches higher counts and only asks for a delete order |
| Kruskal's dead ends (weights for the most rejected edges) | Kruskal stops at the heaviest MST edge, so the answer is to put the largest weights on the smallest edge cut, without following Kruskal at all |
| Trapping rain water | An optimisation puzzle on a bar chart, not an algorithm being pushed |
| Radix tree vs trie | Picking the longest words with different first letters solves it |
| Merge vs quick, and bubble beats insertion | Can't be won: this quicksort always compares more than merge sort, and bubble sort never compares less than insertion sort |
| Insertion beats quicksort, naive matching beats KMP | Not upsets at playable sizes. Insertion sort compares less than this quicksort on 86% or more of random arrays up to 16 values. Counting its failure table, KMP loses to naive matching on 99% of short random texts. |
| Bubble beats merge | Bubble sort can only win in 2 or 3 passes, so every winning array is nearly sorted (4 to 15 out-of-order pairs out of 45 to 66). The recipe is "sorted, with a few values moved left so none has more than one or two bigger values in front". Winnable instances also thin out as the array grows: 7 of 60 at 10 values, 2 of 40 at 12, none of 30 at 14. |
| Insertion beats merge, with no other goal | The ascending fill reached par in 22 of 23 winnable instances. The launch template adds "most out-of-order pairs" to fix this. |
| Naive union-find beats union by size, linear probing beats quadratic | Margins of only 1 to 4. At 6 keys in 13 slots, the two probing schemes tie on 90% of key sets. |
