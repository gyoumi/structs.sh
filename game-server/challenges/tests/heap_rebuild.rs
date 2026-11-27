mod common;

use common::heap::{
    assert_log, cases, insert, invariants, keys, map_step, name, other, run_ok, same, violation,
};
use daily_challenges::heap::{HeapOp, HeapOrder, HeapStep};

// Expected logs are worked by hand from docs/heap.md ("1a. Rust heap module", "Exact step
// order"): run(order, .., items, Rebuild) takes `items` as a heap of the other order and emits
// StartRebuild { order }, then for each old item in index order the Append / CompareParent / Swap
// steps an insert into the heap built so far would emit, ending with Reinserted instead of
// Settled, and finally Rebuilt { order }. Each case is "why | op | items before | step log |
// items after" (notation in common::heap::LEGEND), and `cases` also runs it mirrored: the other
// order with every key negated.

#[test]
fn rebuild_a_max_heap_as_a_min_heap() {
    cases(
        &HeapOrder::Min,
        15,
        &[
            "9 5 7 3 re-inserted under min | Rebuild | [9 5 7 3] | StartRebuild min; Append 9@0; Reinserted 9@0; Append 5@1; CompareParent 1^0 swap; Swap 0<>1; Reinserted 5@0; Append 7@2; CompareParent 2^0 stay; Reinserted 7@2; Append 3@3; CompareParent 3^1 swap; Swap 1<>3; CompareParent 1^0 swap; Swap 0<>1; Reinserted 3@0; Rebuilt min | [3 5 7 9]",
        ],
    );
}

#[test]
fn rebuild_a_min_heap_as_a_max_heap() {
    cases(
        &HeapOrder::Max,
        15,
        &[
            "1 4 2 8 re-inserted under max | Rebuild | [1 4 2 8] | StartRebuild max; Append 1@0; Reinserted 1@0; Append 4@1; CompareParent 1^0 swap; Swap 0<>1; Reinserted 4@0; Append 2@2; CompareParent 2^0 stay; Reinserted 2@2; Append 8@3; CompareParent 3^1 swap; Swap 1<>3; CompareParent 1^0 swap; Swap 0<>1; Reinserted 8@0; Rebuilt max | [8 4 2 1]",
        ],
    );
}

#[test]
fn rebuild_an_empty_heap_or_one_key() {
    cases(
        &HeapOrder::Min,
        15,
        &[
            "nothing to re-insert | Rebuild | [] | StartRebuild min; Rebuilt min | []",
            "one key goes back to the root | Rebuild | [7] | StartRebuild min; Append 7@0; Reinserted 7@0; Rebuilt min | [7]",
        ],
    );
    cases(
        &HeapOrder::Max,
        15,
        &[
            "nothing to re-insert | Rebuild | [] | StartRebuild max; Rebuilt max | []",
            "one key goes back to the root | Rebuild | [7] | StartRebuild max; Append 7@0; Reinserted 7@0; Rebuilt max | [7]",
        ],
    );
    cases(
        &HeapOrder::Max,
        1,
        &[
            "one key at capacity 1 | Rebuild | [4] | StartRebuild max; Append 4@0; Reinserted 4@0; Rebuilt max | [4]",
        ],
    );
}

#[test]
fn rebuild_with_equal_keys_never_swaps() {
    for order in [HeapOrder::Min, HeapOrder::Max] {
        let o = if order == HeapOrder::Min {
            "min"
        } else {
            "max"
        };
        let case = format!(
            "equal keys are valid in both orders | Rebuild | [5 5 5] | StartRebuild {o}; Append 5@0; Reinserted 5@0; Append 5@1; CompareParent 1^0 stay; Reinserted 5@1; Append 5@2; CompareParent 2^0 stay; Reinserted 5@2; Rebuilt {o} | [5 5 5]"
        );
        cases(&order, 15, &[&case]);
    }
}

#[test]
fn rebuild_of_a_full_heap_never_reports_heap_full() {
    cases(
        &HeapOrder::Min,
        4,
        &[
            "4 keys at capacity 4 | Rebuild | [9 5 7 3] | StartRebuild min; Append 9@0; Reinserted 9@0; Append 5@1; CompareParent 1^0 swap; Swap 0<>1; Reinserted 5@0; Append 7@2; CompareParent 2^0 stay; Reinserted 7@2; Append 3@3; CompareParent 3^1 swap; Swap 1<>3; CompareParent 1^0 swap; Swap 0<>1; Reinserted 3@0; Rebuilt min | [3 5 7 9]",
        ],
    );
}

/// What docs/heap.md says a rebuild is: StartRebuild, then each old item inserted in index order
/// into the heap built so far (Settled becoming Reinserted), then Rebuilt.
fn by_inserting(order: &HeapOrder, cap: usize, old: &[i32]) -> (Vec<HeapStep>, Vec<i32>) {
    let mut steps = vec![HeapStep::StartRebuild { order: same(order) }];
    let mut items = Vec::new();
    for key in old {
        let (_, result) = run_ok(order, cap, &items, &insert(*key));
        steps.extend(result.steps.iter().map(|s| match s {
            HeapStep::Settled { key, index } => HeapStep::Reinserted {
                key: *key,
                index: *index,
            },
            s => map_step(s, |k| k, same),
        }));
        items = result.items;
    }
    steps.push(HeapStep::Rebuilt { order: same(order) });
    (steps, items)
}

#[test]
fn rebuild_is_inserting_the_old_items_in_index_order() {
    let max_heaps = [
        "[9 5 7 3]",
        "[90 80 70 60 50 40 30 55 10]",
        "[15 14 13 12 11 10 9 8 7 6 5 4 3 2 1]",
        "[9 9 3 9 1]",
        "[8 3 8 -2 3 8 -5]",
    ];
    let min_heaps = [
        "[1 4 2 8]",
        "[10 20 30 40 50 60 70 45 90]",
        "[1 2 3 4 5 6 7 8 9 10 11 12 13 14 15]",
        "[2 2 3 2]",
        "[-4 0 -4 6 1 0 7]",
    ];
    let sources = [(HeapOrder::Max, max_heaps), (HeapOrder::Min, min_heaps)];
    for (from, heaps) in sources {
        let to = other(&from);
        for spec in heaps {
            let old = keys(spec);
            let ctx = format!("rebuild the {} heap {old:?} as {}", name(&from), name(&to));
            assert!(
                violation(&from, &old).is_none(),
                "test bug: {ctx}: not a valid heap"
            );
            let (want_steps, want_items) = by_inserting(&to, 15, &old);
            let (call, result) = run_ok(&to, 15, &old, &HeapOp::Rebuild);
            let ctx = format!("{call} [{ctx}]");
            let what = "should equal inserting each old item, in index order, into an empty heap of the new order";
            assert_log(&ctx, what, &result.steps, &want_steps);
            let got = &result.items;
            assert_eq!(
                got, &want_items,
                "{ctx}: items {what}: expected {want_items:?}, got {got:?}"
            );
            invariants(&ctx, &to, 15, &old, &HeapOp::Rebuild, &result);
        }
    }
}

#[test]
fn rebuilding_twice_returns_to_a_valid_heap_of_the_first_order() {
    let start = keys("[90 80 70 60 50 40 30 55 10]");
    let (ctx, min) = run_ok(&HeapOrder::Min, 15, &start, &HeapOp::Rebuild);
    invariants(&ctx, &HeapOrder::Min, 15, &start, &HeapOp::Rebuild, &min);
    let (ctx, max) = run_ok(&HeapOrder::Max, 15, &min.items, &HeapOp::Rebuild);
    invariants(
        &ctx,
        &HeapOrder::Max,
        15,
        &min.items,
        &HeapOp::Rebuild,
        &max,
    );
}
