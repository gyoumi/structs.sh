mod common;

use common::heap::{both, insert, keys, name, other, run_err, run_ok};
use daily_challenges::heap::{HeapOp, HeapOrder};

// From docs/heap.md ("1a. Rust heap module"): run rejects capacity == 0, then
// items.len() > capacity (naming both numbers), then items that aren't a heap for `order` (for
// Rebuild, for the other order), naming the smallest index whose key is strictly better than its
// parent's, and that parent's index. The wording is free; these tests only look for the numbers,
// read as whole numbers from the error (so 15 doesn't count as containing 1 or 5).

fn ops() -> [HeapOp; 3] {
    [insert(35), HeapOp::Pop, HeapOp::Rebuild]
}

/// Every whole number written in `message`, in order.
fn numbers(message: &str) -> Vec<usize> {
    let runs = message.split(|c: char| !c.is_ascii_digit());
    runs.filter_map(|run| run.parse().ok()).collect()
}

fn names_all(ctx: &str, message: &str, what: &str, want: &[usize]) {
    let got = numbers(message);
    assert!(
        want.iter().all(|n| got.contains(n)),
        "{ctx}: the error should name {what} {want:?}; whole numbers in it: {got:?}; error {message:?}"
    );
}

#[test]
fn capacity_zero_is_rejected() {
    for order in both() {
        for op in ops() {
            for items in [keys("[]"), keys("[5]")] {
                let (ctx, message) = run_err(&order, 0, &items, &op);
                let ok = message.to_lowercase().contains("capacity");
                assert!(
                    ok,
                    "{ctx}: capacity 0 should be rejected with an error mentioning capacity, got {message:?}"
                );
            }
        }
    }
}

#[test]
fn more_items_than_capacity_is_rejected_naming_both_numbers() {
    for order in both() {
        for (cap, len) in [(1, 2), (3, 4), (3, 7), (15, 16), (15, 30)] {
            // Equal keys are a valid heap of either order, so only the length is wrong.
            let items = vec![100; len];
            for op in ops() {
                let (ctx, message) = run_err(&order, cap, &items, &op);
                let ctx = format!("{ctx} [{len} items with capacity {cap}]");
                names_all(
                    &ctx,
                    &message,
                    "the capacity and the item count",
                    &[cap, len],
                );
            }
        }
    }
}

#[test]
fn a_full_heap_is_not_an_error() {
    for order in both() {
        for op in ops() {
            run_ok(&order, 3, &[100, 100, 100], &op);
        }
    }
}

struct Broken {
    order: HeapOrder,
    items: &'static str,
    index: usize,
    parent: usize,
    /// A later index that also breaks the heap, which shouldn't be the one named.
    later: Option<usize>,
}

const BROKEN: [Broken; 5] = [
    Broken {
        order: HeapOrder::Min,
        items: "[10 4 50]",
        index: 1,
        parent: 0,
        later: None,
    },
    Broken {
        order: HeapOrder::Min,
        items: "[10 20 30 40 15 60 25]",
        index: 4,
        parent: 1,
        later: Some(6),
    },
    Broken {
        order: HeapOrder::Max,
        items: "[90 80 70 60 85 40 75]",
        index: 4,
        parent: 1,
        later: Some(6),
    },
    Broken {
        order: HeapOrder::Min,
        items: "[9 8 7 6 10]",
        index: 1,
        parent: 0,
        later: None,
    },
    Broken {
        order: HeapOrder::Max,
        items: "[9 8 7 6 10]",
        index: 4,
        parent: 1,
        later: None,
    },
];

fn check_broken(order: &HeapOrder, items: &[i32], op: &HeapOp, case: &Broken, why: &str) {
    let (ctx, message) = run_err(order, 15, items, op);
    let ctx = format!("{ctx} [{why}]");
    let (i, p) = (case.index, case.parent);
    names_all(
        &ctx,
        &message,
        "the first index that breaks the heap and its parent",
        &[i, p],
    );
    if let Some(later) = case.later {
        let named = numbers(&message).contains(&later);
        assert!(
            !named,
            "{ctx}: index {i} is the smallest that breaks the heap, so the error should name it rather than index {later}; error {message:?}"
        );
    }
}

#[test]
fn items_that_are_not_a_heap_are_rejected_naming_the_first_bad_index() {
    for case in &BROKEN {
        let items = keys(case.items);
        let checked = name(&case.order);
        for op in [insert(35), HeapOp::Pop] {
            let why = format!(
                "not a {checked} heap: index {} is better than its parent {}",
                case.index, case.parent
            );
            check_broken(&case.order, &items, &op, case, &why);
        }
        // Rebuild checks the items against the other order: rebuilding as `other` means the
        // items should be a heap of `case.order`.
        let why = format!(
            "Rebuild as {} needs a {checked} heap; index {} is better than its parent {} under {checked}",
            name(&other(&case.order)),
            case.index,
            case.parent
        );
        check_broken(&other(&case.order), &items, &HeapOp::Rebuild, case, &why);
    }
}

#[test]
fn rebuild_checks_the_items_against_the_other_order() {
    // [5 5 5 5 9] is a valid min-heap but breaks a max-heap at index 4 (9 > its parent 5 at 1),
    // and [5 5 5 5 1] the other way round.
    let cases = [
        (HeapOrder::Min, "[5 5 5 5 9]"),
        (HeapOrder::Max, "[5 5 5 5 1]"),
    ];
    for (order, spec) in cases {
        let items = keys(spec);
        run_ok(&order, 15, &items, &insert(5));
        let (ctx, message) = run_err(&order, 15, &items, &HeapOp::Rebuild);
        let checked = name(&other(&order));
        let ctx = format!(
            "{ctx} [a valid {} heap, but Rebuild checks it as a {checked} heap, which index 4 breaks]",
            name(&order)
        );
        names_all(&ctx, &message, "index 4 and its parent", &[4, 1]);
        run_ok(&other(&order), 15, &items, &HeapOp::Rebuild);
    }
}

#[test]
fn capacity_is_checked_before_the_item_count_and_the_heap() {
    // With capacity 0 the items can't matter: the error is the same as for no items.
    for order in both() {
        for op in ops() {
            let (_, want) = run_err(&order, 0, &[], &op);
            let (ctx, got) = run_err(&order, 0, &[10, 4, 50, 60], &op);
            assert_eq!(
                got, want,
                "{ctx}: capacity 0 is checked first, so the error should be the same as with no items ({want:?}), got {got:?}"
            );
        }
    }
}

#[test]
fn the_item_count_is_checked_before_the_heap() {
    // 3 items with capacity 2, and index 1 breaks the heap: the error should be about the count.
    let cases = [
        (HeapOrder::Min, "[10 4 50]", insert(35)),
        (HeapOrder::Max, "[10 40 5]", HeapOp::Pop),
        (HeapOrder::Min, "[10 40 5]", HeapOp::Rebuild),
        (HeapOrder::Max, "[10 4 50]", HeapOp::Rebuild),
    ];
    for (order, spec, op) in cases {
        let (ctx, message) = run_err(&order, 2, &keys(spec), &op);
        let ctx = format!("{ctx} [too many items and not a heap]");
        names_all(&ctx, &message, "the capacity and the item count", &[2, 3]);
    }
}
