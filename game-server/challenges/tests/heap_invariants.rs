mod common;

use common::heap::{both, insert, invariants, name, other, run_ok};
use daily_challenges::heap::{HeapOp, HeapOrder};

// The step-log invariants from docs/heap.md, checked over many runs of every operation: exactly
// one terminal step (Settled, PoppedLast, Empty, HeapFull or Rebuilt) and it comes last;
// comparisons and swaps match the CompareParent + CompareChildren and Swap steps; every Swap comes
// straight after a compare with swap: true and every such compare is followed by its Swap; and the
// items are a valid heap of the order. `invariants` also replays the steps on the old items and
// checks each step's indices, keys, `best` and `swap` against the array at that point.

/// A small fixed-seed generator, so the sweep is the same on every run.
struct Lcg(u64);

impl Lcg {
    fn below(&mut self, n: u64) -> u64 {
        self.0 = self
            .0
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1_442_695_040_888_963_407);
        (self.0 >> 33) % n
    }

    /// A key in `-spread / 2 .. spread - spread / 2`; a small spread gives many duplicates.
    fn key(&mut self, spread: u64) -> i32 {
        let k = i64::try_from(self.below(spread)).expect("small")
            - i64::try_from(spread / 2).expect("small");
        i32::try_from(k).expect("key fits i32")
    }
}

fn checked(order: &HeapOrder, cap: usize, before: &[i32], op: &HeapOp) -> Vec<i32> {
    let (ctx, result) = run_ok(order, cap, before, op);
    invariants(&ctx, order, cap, before, op, &result);
    result.items
}

#[test]
fn every_operation_keeps_the_step_log_invariants() {
    let mut rng = Lcg(0x5eed_4ea9);
    let mut runs = 0;
    for order in both() {
        for cap in [1, 2, 3, 4, 7, 8, 15] {
            for trial in 0..12 {
                let spread = [3, 10, 200][trial % 3];
                let (mut heap, mut other_heap) = (Vec::new(), Vec::new());
                // Two keys more than the capacity, so full heaps get inserted into too.
                for _ in 0..cap + 2 {
                    let key = rng.key(spread);
                    heap = checked(&order, cap, &heap, &insert(key));
                    other_heap = checked(&other(&order), cap, &other_heap, &insert(key));
                    checked(&order, cap, &other_heap, &HeapOp::Rebuild);
                    runs += 3;
                    if rng.below(4) == 0 {
                        heap = checked(&order, cap, &heap, &HeapOp::Pop);
                        runs += 1;
                    }
                }
                // Pop the heap empty, then rebuild the other-order heap into `order` and pop
                // that empty too.
                for _ in 0..2 {
                    while !heap.is_empty() {
                        heap = checked(&order, cap, &heap, &HeapOp::Pop);
                        runs += 1;
                    }
                    heap = checked(&order, cap, &other_heap, &HeapOp::Rebuild);
                    other_heap.clear();
                }
                checked(&order, cap, &heap, &HeapOp::Pop);
                checked(&order, cap, &heap, &HeapOp::Rebuild);
                runs += 3;
            }
        }
    }
    assert!(
        runs > 1000,
        "the sweep should check over 1000 runs, checked {runs}"
    );
}

#[test]
fn inserting_then_popping_everything_keeps_the_invariants_in_both_orders() {
    // Sorted, reverse-sorted and all-equal inputs, which push sifting to its extremes.
    let ascending: Vec<i32> = (1..=15).collect();
    let descending: Vec<i32> = (1..=15).rev().collect();
    let equal = vec![4; 15];
    for order in both() {
        for keys in [&ascending, &descending, &equal] {
            let mut heap = Vec::new();
            for key in keys {
                heap = checked(&order, 15, &heap, &insert(*key));
            }
            let full = heap.len();
            assert_eq!(
                full,
                15,
                "inserting {keys:?} into an empty {} heap of capacity 15: expected 15 items, got {full}",
                name(&order)
            );
            heap = checked(&order, 15, &heap, &insert(0));
            while !heap.is_empty() {
                heap = checked(&order, 15, &heap, &HeapOp::Pop);
            }
        }
    }
}
