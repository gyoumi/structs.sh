mod common;

use common::heap::{
    LEGEND, assert_log, both, cases, insert, invariants, mirror_step, name, negated, run_ok,
};
use daily_challenges::heap::{HeapOp, HeapOrder};

// Expected logs are worked by hand from docs/heap.md ("1a. Rust heap module", "Exact step
// order"): Empty for an empty heap, TakeRoot then PoppedLast for one key, otherwise TakeRoot,
// MoveLastToRoot from the last index, then CompareChildren while the moved key has a left child
// in the shrunk heap (best = the strictly better child, left on a tie; swap when best is strictly
// better than the moved key), a Swap after each swap: true, and Settled where it stops. Each case
// is "why | op | items before | step log | items after" (notation in common::heap::LEGEND), and
// `cases` also runs it mirrored: the other order with every key negated.

#[test]
fn pop_from_an_empty_heap_is_empty() {
    for order in both() {
        cases(&order, 15, &["nothing to pop | Pop | [] | Empty | []"]);
        cases(
            &order,
            1,
            &["nothing to pop at capacity 1 | Pop | [] | Empty | []"],
        );
    }
}

#[test]
fn pop_from_one_key_is_popped_last() {
    for order in both() {
        cases(
            &order,
            15,
            &["the root is the only key | Pop | [4] | TakeRoot 4; PoppedLast 4 | []"],
        );
        cases(
            &order,
            1,
            &["a full heap of capacity 1 | Pop | [7] | TakeRoot 7; PoppedLast 7 | []"],
        );
    }
}

#[test]
fn pop_from_two_keys_moves_the_last_key_without_comparing() {
    cases(
        &HeapOrder::Max,
        15,
        &[
            "the moved key 5 has no children left | Pop | [9 5] | TakeRoot 9; MoveLastToRoot 5 from 1; Settled 5@0 | [5]",
            "equal keys | Pop | [3 3] | TakeRoot 3; MoveLastToRoot 3 from 1; Settled 3@0 | [3]",
        ],
    );
    cases(
        &HeapOrder::Min,
        15,
        &[
            "the moved key 5 has no children left | Pop | [1 5] | TakeRoot 1; MoveLastToRoot 5 from 1; Settled 5@0 | [5]",
        ],
    );
}

#[test]
fn pop_compares_a_root_that_has_only_a_left_child() {
    cases(
        &HeapOrder::Max,
        15,
        &[
            "7 stays above its only child 5 | Pop | [9 5 7] | TakeRoot 9; MoveLastToRoot 7 from 2; CompareChildren 0 [1 -] best 1 stay; Settled 7@0 | [7 5]",
            "5 swaps with its only child 7 | Pop | [9 7 5] | TakeRoot 9; MoveLastToRoot 5 from 2; CompareChildren 0 [1 -] best 1 swap; Swap 0<>1; Settled 5@1 | [7 5]",
        ],
    );
    cases(
        &HeapOrder::Min,
        15,
        &[
            "3 stays above its only child 5 | Pop | [1 5 3] | TakeRoot 1; MoveLastToRoot 3 from 2; CompareChildren 0 [1 -] best 1 stay; Settled 3@0 | [3 5]",
            "5 swaps with its only child 3 | Pop | [1 3 5] | TakeRoot 1; MoveLastToRoot 5 from 2; CompareChildren 0 [1 -] best 1 swap; Swap 0<>1; Settled 5@1 | [3 5]",
        ],
    );
}

#[test]
fn pop_sifts_down_past_two_child_nodes_then_a_left_only_node() {
    // 9 keys, so after the pop index 3's only child is index 7.
    cases(
        &HeapOrder::Max,
        15,
        &[
            "10 sinks past 80, 60 and 55 to a leaf | Pop | [90 80 70 60 50 40 30 55 10] | TakeRoot 90; MoveLastToRoot 10 from 8; CompareChildren 0 [1 2] best 1 swap; Swap 0<>1; CompareChildren 1 [3 4] best 3 swap; Swap 1<>3; CompareChildren 3 [7 -] best 7 swap; Swap 3<>7; Settled 10@7 | [80 60 70 55 50 40 30 10]",
        ],
    );
    cases(
        &HeapOrder::Min,
        15,
        &[
            "90 sinks past 20, 40 and 45 to a leaf | Pop | [10 20 30 40 50 60 70 45 90] | TakeRoot 10; MoveLastToRoot 90 from 8; CompareChildren 0 [1 2] best 1 swap; Swap 0<>1; CompareChildren 1 [3 4] best 3 swap; Swap 1<>3; CompareChildren 3 [7 -] best 7 swap; Swap 3<>7; Settled 90@7 | [20 40 30 45 50 60 70 90]",
        ],
    );
}

#[test]
fn pop_goes_right_when_the_right_child_is_strictly_better() {
    cases(
        &HeapOrder::Max,
        15,
        &[
            "40 swaps right with 80, then stays above its only child 30 | Pop | [90 70 80 10 20 30 40] | TakeRoot 90; MoveLastToRoot 40 from 6; CompareChildren 0 [1 2] best 2 swap; Swap 0<>2; CompareChildren 2 [5 -] best 5 stay; Settled 40@2 | [80 70 40 10 20 30]",
        ],
    );
    cases(
        &HeapOrder::Min,
        15,
        &[
            "60 swaps right with 20, then stays above its only child 70 | Pop | [10 30 20 90 80 70 60] | TakeRoot 10; MoveLastToRoot 60 from 6; CompareChildren 0 [1 2] best 2 swap; Swap 0<>2; CompareChildren 2 [5 -] best 5 stay; Settled 60@2 | [20 30 60 90 80 70]",
        ],
    );
}

#[test]
fn pop_on_a_tie_between_the_children_picks_the_left() {
    cases(
        &HeapOrder::Max,
        15,
        &[
            "children 7 and 7 tie, so 2 swaps left | Pop | [9 7 7 1 2] | TakeRoot 9; MoveLastToRoot 2 from 4; CompareChildren 0 [1 2] best 1 swap; Swap 0<>1; CompareChildren 1 [3 -] best 3 stay; Settled 2@1 | [7 2 7 1]",
        ],
    );
    cases(
        &HeapOrder::Min,
        15,
        &[
            "children 4 and 4 tie, so 8 swaps left | Pop | [1 4 4 9 8] | TakeRoot 1; MoveLastToRoot 8 from 4; CompareChildren 0 [1 2] best 1 swap; Swap 0<>1; CompareChildren 1 [3 -] best 3 stay; Settled 8@1 | [4 8 4 9]",
        ],
    );
}

#[test]
fn pop_where_the_moved_key_equals_the_better_child_does_not_swap() {
    cases(
        &HeapOrder::Max,
        15,
        &[
            "6 equals its better child 6 | Pop | [9 6 4 6] | TakeRoot 9; MoveLastToRoot 6 from 3; CompareChildren 0 [1 2] best 1 stay; Settled 6@0 | [6 6 4]",
            "all keys equal: best is the left, no swap | Pop | [5 5 5 5] | TakeRoot 5; MoveLastToRoot 5 from 3; CompareChildren 0 [1 2] best 1 stay; Settled 5@0 | [5 5 5]",
            "5 sinks once, then ties with both children 5 and stops | Pop | [9 8 7 5 5 5] | TakeRoot 9; MoveLastToRoot 5 from 5; CompareChildren 0 [1 2] best 1 swap; Swap 0<>1; CompareChildren 1 [3 4] best 3 stay; Settled 5@1 | [8 5 7 5 5]",
        ],
    );
    cases(
        &HeapOrder::Min,
        15,
        &[
            "3 equals its better child 3 | Pop | [1 3 5 3] | TakeRoot 1; MoveLastToRoot 3 from 3; CompareChildren 0 [1 2] best 1 stay; Settled 3@0 | [3 3 5]",
        ],
    );
}

#[test]
fn pop_from_a_full_heap_of_capacity_15() {
    cases(
        &HeapOrder::Max,
        15,
        &[
            "1 sinks past 14, 12 and 8 | Pop | [15 14 13 12 11 10 9 8 7 6 5 4 3 2 1] | TakeRoot 15; MoveLastToRoot 1 from 14; CompareChildren 0 [1 2] best 1 swap; Swap 0<>1; CompareChildren 1 [3 4] best 3 swap; Swap 1<>3; CompareChildren 3 [7 8] best 7 swap; Swap 3<>7; Settled 1@7 | [14 12 13 8 11 10 9 1 7 6 5 4 3 2]",
        ],
    );
}

#[test]
fn popping_until_empty_takes_the_keys_best_first_and_mirrors() {
    let keys = [5, 3, 8, 1, 9, 2, 7, 5, 3, 9, 0, 6, 4, 8, 2];
    let (mut max, mut min): (Vec<i32>, Vec<i32>) = (Vec::new(), Vec::new());
    for key in keys {
        max = run_ok(&HeapOrder::Max, 15, &max, &insert(key)).1.items;
        min = run_ok(&HeapOrder::Min, 15, &min, &insert(-key)).1.items;
    }
    let mut popped = Vec::new();
    while !max.is_empty() {
        let (max_ctx, a) = run_ok(&HeapOrder::Max, 15, &max, &HeapOp::Pop);
        let (min_ctx, b) = run_ok(&HeapOrder::Min, 15, &min, &HeapOp::Pop);
        let ctx = format!("{min_ctx} vs {max_ctx}");
        let mirrored: Vec<_> = a.steps.iter().map(mirror_step).collect();
        assert_log(
            &ctx,
            "the Min log should mirror the Max log",
            &b.steps,
            &mirrored,
        );
        let want = negated(&a.items);
        assert_eq!(
            b.items, want,
            "{ctx}: Min items should be the Max items negated, {want:?}, got {:?}",
            b.items
        );
        let want = a.popped.map(|k| -k);
        assert_eq!(
            b.popped, want,
            "{ctx}: Min popped should be Max popped negated, {want:?}, got {:?}\n{LEGEND}",
            b.popped
        );
        invariants(&max_ctx, &HeapOrder::Max, 15, &max, &HeapOp::Pop, &a);
        invariants(&min_ctx, &HeapOrder::Min, 15, &min, &HeapOp::Pop, &b);
        popped.extend(a.popped);
        (max, min) = (a.items, b.items);
    }
    let mut want = keys.to_vec();
    want.sort_unstable_by(|a, b| b.cmp(a));
    let order = name(&HeapOrder::Max);
    assert_eq!(
        popped, want,
        "inserting {keys:?} into an empty {order} heap and popping until empty should pop {want:?}, got {popped:?}"
    );
}
