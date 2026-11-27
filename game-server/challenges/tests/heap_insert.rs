mod common;

use common::heap::{
    LEGEND, assert_log, both, cases, cases_unmirrored, insert, invariants, mirror_step, negated,
    run_ok,
};
use daily_challenges::heap::{DEFAULT_CAPACITY, HeapOrder};

// Expected logs are worked by hand from docs/heap.md ("1a. Rust heap module", "Exact step
// order"): Append at the end, then CompareParent while index > 0, a Swap after each compare with
// swap: true (strictly better than the parent), and Settled where the key stops. Each case is
// "why | op | items before | step log | items after" (notation in common::heap::LEGEND), and
// `cases` also runs it mirrored: the other order with every key negated.

#[test]
fn default_capacity_is_15() {
    let m = DEFAULT_CAPACITY;
    assert_eq!(
        m, 15,
        "DEFAULT_CAPACITY should be 15 (four full levels), got {m}"
    );
}

#[test]
fn insert_into_an_empty_heap_settles_at_the_root_without_comparing() {
    for order in both() {
        let case = "first key goes to the root | Insert 5 | [] | Append 5@0; Settled 5@0 | [5]";
        cases(&order, 15, &[case]);
    }
    cases(
        &HeapOrder::Min,
        1,
        &["capacity 1 has room for one key | Insert 7 | [] | Append 7@0; Settled 7@0 | [7]"],
    );
}

#[test]
fn insert_that_stops_at_once() {
    cases(
        &HeapOrder::Max,
        15,
        &[
            "3 isn't greater than its parent 5 | Insert 3 | [9 5 7] | Append 3@3; CompareParent 3^1 stay; Settled 3@3 | [9 5 7 3]",
            "the right child of the root | Insert 4 | [9 5] | Append 4@2; CompareParent 2^0 stay; Settled 4@2 | [9 5 4]",
        ],
    );
    cases(
        &HeapOrder::Min,
        15,
        &[
            "7 isn't smaller than its parent 5 | Insert 7 | [1 5 3] | Append 7@3; CompareParent 3^1 stay; Settled 7@3 | [1 5 3 7]",
        ],
    );
}

#[test]
fn insert_that_sifts_part_of_the_way() {
    cases(
        &HeapOrder::Max,
        15,
        &[
            "8 passes 5, stops below 9 | Insert 8 | [9 5 7 3] | Append 8@4; CompareParent 4^1 swap; Swap 1<>4; CompareParent 1^0 stay; Settled 8@1 | [9 8 7 3 5]",
            "4 levels: 18 passes 8 and 15, stops below 20 | Insert 18 | [20 15 10 8 7 6 5 4] | Append 18@8; CompareParent 8^3 swap; Swap 3<>8; CompareParent 3^1 swap; Swap 1<>3; CompareParent 1^0 stay; Settled 18@1 | [20 18 10 15 7 6 5 4 8]",
        ],
    );
    cases(
        &HeapOrder::Min,
        15,
        &[
            "2 passes 5, stops below 1 | Insert 2 | [1 5 3 7] | Append 2@4; CompareParent 4^1 swap; Swap 1<>4; CompareParent 1^0 stay; Settled 2@1 | [1 2 3 7 5]",
        ],
    );
}

#[test]
fn insert_that_sifts_all_the_way_to_the_root() {
    cases(
        &HeapOrder::Max,
        15,
        &[
            "10 passes 7 and 9 | Insert 10 | [9 5 7 3 4 6] | Append 10@6; CompareParent 6^2 swap; Swap 2<>6; CompareParent 2^0 swap; Swap 0<>2; Settled 10@0 | [10 5 9 3 4 6 7]",
            "30 passes 8, 15 and 20 | Insert 30 | [20 15 10 8 7 6 5 4] | Append 30@8; CompareParent 8^3 swap; Swap 3<>8; CompareParent 3^1 swap; Swap 1<>3; CompareParent 1^0 swap; Swap 0<>1; Settled 30@0 | [30 20 10 15 7 6 5 4 8]",
        ],
    );
    cases(
        &HeapOrder::Min,
        15,
        &[
            "0 passes 4, 2 and 1 | Insert 0 | [1 2 3 4 5 6 7 8] | Append 0@8; CompareParent 8^3 swap; Swap 3<>8; CompareParent 3^1 swap; Swap 1<>3; CompareParent 1^0 swap; Swap 0<>1; Settled 0@0 | [0 1 3 2 5 6 7 8 4]",
            "a second key that is better than the root | Insert 2 | [6] | Append 2@1; CompareParent 1^0 swap; Swap 0<>1; Settled 2@0 | [2 6]",
        ],
    );
}

#[test]
fn insert_of_a_key_equal_to_its_parent_does_not_swap() {
    cases(
        &HeapOrder::Max,
        15,
        &[
            "5 equals its parent 5 | Insert 5 | [9 5 7] | Append 5@3; CompareParent 3^1 stay; Settled 5@3 | [9 5 7 5]",
            "9 passes 5, then stops below the equal root 9 | Insert 9 | [9 5 7] | Append 9@3; CompareParent 3^1 swap; Swap 1<>3; CompareParent 1^0 stay; Settled 9@1 | [9 9 7 5]",
            "all keys equal | Insert 4 | [4 4 4] | Append 4@3; CompareParent 3^1 stay; Settled 4@3 | [4 4 4 4]",
        ],
    );
    cases(
        &HeapOrder::Min,
        15,
        &[
            "5 equals its parent 5 | Insert 5 | [1 5 3] | Append 5@3; CompareParent 3^1 stay; Settled 5@3 | [1 5 3 5]",
            "1 passes 5, then stops below the equal root 1 | Insert 1 | [1 5 3] | Append 1@3; CompareParent 3^1 swap; Swap 1<>3; CompareParent 1^0 stay; Settled 1@1 | [1 1 3 5]",
        ],
    );
}

#[test]
fn insert_into_a_full_heap_is_heap_full_and_leaves_the_items() {
    let max: Vec<String> = (86..=100).rev().map(|k| k.to_string()).collect();
    let max = format!("[{}]", max.join(" "));
    let min: Vec<String> = (1..=15).map(|k| k.to_string()).collect();
    let min = format!("[{}]", min.join(" "));
    let max_case = format!("15 keys fill capacity 15 | Insert 101 | {max} | HeapFull 101 | {max}");
    let min_case = format!("15 keys fill capacity 15 | Insert 0 | {min} | HeapFull 0 | {min}");
    cases(&HeapOrder::Max, DEFAULT_CAPACITY, &[&max_case]);
    cases(&HeapOrder::Min, DEFAULT_CAPACITY, &[&min_case]);
    cases(
        &HeapOrder::Max,
        3,
        &["capacity 3 is full | Insert 8 | [9 5 7] | HeapFull 8 | [9 5 7]"],
    );
    cases(
        &HeapOrder::Min,
        3,
        &["capacity 3 is full | Insert 0 | [1 5 3] | HeapFull 0 | [1 5 3]"],
    );
    for order in both() {
        cases(
            &order,
            1,
            &["capacity 1 is full | Insert 2 | [4] | HeapFull 2 | [4]"],
        );
    }
}

#[test]
fn small_capacity_with_room_inserts_as_usual() {
    cases(
        &HeapOrder::Max,
        4,
        &[
            "the 4th key fills capacity 4 | Insert 8 | [9 5 7] | Append 8@3; CompareParent 3^1 swap; Swap 1<>3; CompareParent 1^0 stay; Settled 8@1 | [9 8 7 5]",
        ],
    );
    cases(
        &HeapOrder::Min,
        2,
        &[
            "the 2nd key fills capacity 2 | Insert 3 | [5] | Append 3@1; CompareParent 1^0 swap; Swap 0<>1; Settled 3@0 | [3 5]",
        ],
    );
}

#[test]
fn insert_takes_any_i32_key() {
    cases_unmirrored(
        &HeapOrder::Max,
        15,
        &[
            "i32::MAX rises to the root | Insert 2147483647 | [5 0] | Append 2147483647@2; CompareParent 2^0 swap; Swap 0<>2; Settled 2147483647@0 | [2147483647 0 5]",
            "i32::MIN stays at the bottom | Insert -2147483648 | [2147483647 0] | Append -2147483648@2; CompareParent 2^0 stay; Settled -2147483648@2 | [2147483647 0 -2147483648]",
        ],
    );
    cases_unmirrored(
        &HeapOrder::Min,
        15,
        &[
            "i32::MIN rises to the root | Insert -2147483648 | [0 5] | Append -2147483648@2; CompareParent 2^0 swap; Swap 0<>2; Settled -2147483648@0 | [-2147483648 5 0]",
            "i32::MAX stays at the bottom | Insert 2147483647 | [-2147483648 0] | Append 2147483647@2; CompareParent 2^0 stay; Settled 2147483647@2 | [-2147483648 0 2147483647]",
            "negative keys | Insert -3 | [-2 4] | Append -3@2; CompareParent 2^0 swap; Swap 0<>2; Settled -3@0 | [-3 4 -2]",
        ],
    );
}

#[test]
fn the_same_inserts_into_a_min_heap_and_a_max_heap_mirror_each_other() {
    // Inserting keys into a max-heap and the negated keys into a min-heap, one after another
    // from empty, must give mirror-image results at every insert.
    let sequence = [5, 3, 8, 1, 9, 2, 7, 5, 3, 9, 0, 6, 4, 8, 2, 1];
    let (mut max, mut min): (Vec<i32>, Vec<i32>) = (Vec::new(), Vec::new());
    for (n, key) in sequence.into_iter().enumerate() {
        let (max_ctx, a) = run_ok(&HeapOrder::Max, 15, &max, &insert(key));
        let (min_ctx, b) = run_ok(&HeapOrder::Min, 15, &min, &insert(-key));
        let ctx = format!("insert #{n} of {sequence:?}: {min_ctx} vs {max_ctx}");
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
        let counts = (a.comparisons, a.swaps);
        let got = (b.comparisons, b.swaps);
        assert_eq!(
            got, counts,
            "{ctx}: (comparisons, swaps) should match Max's {counts:?}, got {got:?}\n{LEGEND}"
        );
        invariants(&max_ctx, &HeapOrder::Max, 15, &max, &insert(key), &a);
        invariants(&min_ctx, &HeapOrder::Min, 15, &min, &insert(-key), &b);
        (max, min) = (a.items, b.items);
    }
}
