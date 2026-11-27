//! The step-log invariants from docs/heap.md ("Exact step order"), checked on any run.
#![allow(dead_code)]

use daily_challenges::heap::{HeapOp, HeapOrder, HeapRunResult, HeapStep};

use crate::common::heap::{
    LEGEND, better, count_compares, count_swaps, describe, same, show_log, sorted, violation,
};

fn is_terminal(step: &HeapStep) -> bool {
    matches!(
        step,
        HeapStep::Settled { .. }
            | HeapStep::PoppedLast { .. }
            | HeapStep::Empty
            | HeapStep::HeapFull { .. }
            | HeapStep::Rebuilt { .. }
    )
}

fn is_stop(step: Option<&HeapStep>) -> bool {
    matches!(
        step,
        Some(HeapStep::Settled { .. } | HeapStep::Reinserted { .. })
    )
}

/// Checks one step against the array as the steps so far have left it, then applies it.
fn replay_one(
    order: &HeapOrder,
    cap: usize,
    arr: &mut Vec<i32>,
    step: &HeapStep,
) -> Result<(), String> {
    let len = arr.len();
    let key_at = |arr: &[i32], i: usize| arr.get(i).copied();
    match step {
        HeapStep::Append { key, index } => {
            if *index != len {
                return Err(format!("Append should put the key at the end, index {len}"));
            }
            if len >= cap {
                return Err(format!(
                    "Append into a heap already holding capacity {cap} keys"
                ));
            }
            arr.push(*key);
        }
        HeapStep::CompareParent {
            index,
            parent,
            swap,
        } => {
            if *index == 0 || *index >= len {
                return Err(format!("index should be in 1..{len}"));
            }
            let want = (index - 1) / 2;
            if *parent != want {
                return Err(format!("the parent of index {index} is {want}"));
            }
            let (k, p) = (arr[*index], arr[*parent]);
            let want = better(order, k, p);
            if *swap != want {
                return Err(format!(
                    "key {k} at {index} vs parent key {p} at {parent}: swap should be {want} \
                     (true only when strictly better)"
                ));
            }
        }
        HeapStep::Swap { parent, child } => {
            if *parent >= len || *child >= len {
                return Err(format!("both indices should be below {len}"));
            }
            arr.swap(*parent, *child);
        }
        HeapStep::TakeRoot { key } => {
            if key_at(arr, 0) != Some(*key) {
                return Err("TakeRoot's key should be the root's key".to_owned());
            }
        }
        HeapStep::MoveLastToRoot { key, from } => {
            if len < 2 || *from != len - 1 || arr[*from] != *key {
                return Err(format!(
                    "MoveLastToRoot needs 2 or more keys and should move the last key \
                     (index {}) to the root",
                    len.saturating_sub(1)
                ));
            }
            arr[0] = *key;
            arr.pop();
        }
        HeapStep::CompareChildren {
            index,
            left,
            right,
            best,
            swap,
        } => {
            let l = 2 * index + 1;
            if *index >= len || l >= len {
                return Err(format!(
                    "CompareChildren is emitted only when index {index} has a left child in \
                     a heap of {len} keys"
                ));
            }
            let r = (l + 1 < len).then_some(l + 1);
            if *left != l || *right != r {
                return Err(format!(
                    "children of {index} with {len} keys: left {l}, right {r:?}"
                ));
            }
            let b = match r {
                Some(r) if better(order, arr[r], arr[l]) => r,
                _ => l,
            };
            if *best != b {
                return Err(format!("best should be {b} (the left child on a tie)"));
            }
            let (k, c) = (arr[*index], arr[b]);
            let want = better(order, c, k);
            if *swap != want {
                return Err(format!(
                    "best child key {c} vs key {k} at {index}: swap should be {want} \
                     (true only when strictly better)"
                ));
            }
        }
        HeapStep::Settled { key, index } | HeapStep::Reinserted { key, index } => {
            if key_at(arr, *index) != Some(*key) {
                return Err(format!("the key at index {index} should be {key}"));
            }
        }
        HeapStep::PoppedLast { key } => {
            if arr[..] != [*key] {
                return Err(format!("PoppedLast {key} needs the heap to be [{key}]"));
            }
            arr.clear();
        }
        HeapStep::Empty => {
            if len != 0 {
                return Err("Empty is only for a pop on an empty heap".to_owned());
            }
        }
        HeapStep::HeapFull { .. } => {
            if len != cap {
                return Err(format!(
                    "HeapFull needs {cap} keys (the capacity), not {len}"
                ));
            }
        }
        HeapStep::StartRebuild { order: o } | HeapStep::Rebuilt { order: o } => {
            if o != order {
                return Err("the order should be the order passed to run".to_owned());
            }
            if matches!(step, HeapStep::StartRebuild { .. }) {
                arr.clear();
            }
        }
    }
    Ok(())
}

fn replay(
    order: &HeapOrder,
    cap: usize,
    before: &[i32],
    steps: &[HeapStep],
) -> Result<Vec<i32>, String> {
    let mut arr = before.to_vec();
    for (n, step) in steps.iter().enumerate() {
        let was = arr.clone();
        if let Err(why) = replay_one(order, cap, &mut arr, step) {
            return Err(format!(
                "step {n} ({}): {why}; array before it {was:?}",
                describe(step)
            ));
        }
    }
    Ok(arr)
}

fn check_links(steps: &[HeapStep], problems: &mut Vec<String>) {
    for (n, step) in steps.iter().enumerate() {
        let next = steps.get(n + 1);
        let prev = n.checked_sub(1).and_then(|p| steps.get(p));
        let (want, swap) = match step {
            HeapStep::CompareParent {
                index,
                parent,
                swap,
            } => (
                HeapStep::Swap {
                    parent: *parent,
                    child: *index,
                },
                *swap,
            ),
            HeapStep::CompareChildren {
                index, best, swap, ..
            } => (
                HeapStep::Swap {
                    parent: *index,
                    child: *best,
                },
                *swap,
            ),
            HeapStep::Swap { .. } => {
                let ok = matches!(
                    prev,
                    Some(
                        HeapStep::CompareParent { swap: true, .. }
                            | HeapStep::CompareChildren { swap: true, .. }
                    )
                );
                if !ok {
                    problems.push(format!(
                        "step {n}: every Swap should come straight after a compare step with \
                         swap: true"
                    ));
                }
                continue;
            }
            _ => continue,
        };
        if swap && next != Some(&want) {
            problems.push(format!(
                "step {n}: a compare with swap: true should be followed by {}",
                describe(&want)
            ));
        }
        if !swap && !is_stop(next) {
            problems.push(format!(
                "step {n}: a compare with swap: false stops sifting, so Settled or Reinserted \
                 should follow"
            ));
        }
    }
}

fn check_op(
    (order, cap, before, op): (&HeapOrder, usize, &[i32], &HeapOp),
    result: &HeapRunResult,
    problems: &mut Vec<String>,
) {
    let (steps, items) = (&result.steps, &result.items);
    let mut push = |problem: String| problems.push(problem);
    let (want_popped, want_keys, first) = match op {
        HeapOp::Insert { key } if before.len() == cap => {
            if steps[..] != [HeapStep::HeapFull { key: *key }] || items[..] != before[..] {
                push(format!(
                    "insert into a full heap: log [HeapFull {key}], items unchanged"
                ));
            }
            (None, sorted(before), HeapStep::HeapFull { key: *key })
        }
        HeapOp::Insert { key } => {
            let mut keys = before.to_vec();
            keys.push(*key);
            let index = before.len();
            (None, sorted(&keys), HeapStep::Append { key: *key, index })
        }
        HeapOp::Pop if before.is_empty() => (None, Vec::new(), HeapStep::Empty),
        HeapOp::Pop => {
            let root = before[0];
            (
                Some(root),
                sorted(&before[1..]),
                HeapStep::TakeRoot { key: root },
            )
        }
        HeapOp::Rebuild => {
            let appended: Vec<i32> = steps
                .iter()
                .filter_map(|s| match s {
                    HeapStep::Append { key, .. } => Some(*key),
                    _ => None,
                })
                .collect();
            if appended[..] != before[..] {
                push(format!(
                    "a rebuild should append the old items in index order {before:?}, \
                     appended {appended:?}"
                ));
            }
            let reinserted = steps
                .iter()
                .filter(|s| matches!(s, HeapStep::Reinserted { .. }));
            if reinserted.count() != before.len() {
                push(format!(
                    "a rebuild should have one Reinserted per old item ({})",
                    before.len()
                ));
            }
            let order = same(order);
            (None, sorted(before), HeapStep::StartRebuild { order })
        }
    };
    if steps.first() != Some(&first) {
        push(format!("the first step should be {}", describe(&first)));
    }
    if sorted(items) != want_keys {
        push(format!(
            "the items should hold the keys {want_keys:?} (sorted), got {:?}",
            sorted(items)
        ));
    }
    if result.popped != want_popped {
        push(format!(
            "popped should be {want_popped:?}, got {:?}",
            result.popped
        ));
    }
}

/// Checks every invariant docs/heap.md gives for the run `op` on `before`, and that replaying
/// the steps from `before` (Append pushes, Swap swaps, MoveLastToRoot moves the last key to the
/// root, StartRebuild empties) matches what each step claims and ends at the returned items.
pub fn invariants(
    ctx: &str,
    order: &HeapOrder,
    cap: usize,
    before: &[i32],
    op: &HeapOp,
    result: &HeapRunResult,
) {
    let steps = &result.steps;
    let mut problems = Vec::new();
    let terminals = steps.iter().filter(|s| is_terminal(s)).count();
    if terminals != 1 || !steps.last().is_some_and(is_terminal) {
        problems.push(format!(
            "the log should end with exactly one terminal step (Settled, PoppedLast, Empty, \
             HeapFull or Rebuilt; Reinserted isn't terminal), found {terminals}"
        ));
    }
    let (got, want) = (result.comparisons as usize, count_compares(steps));
    if got != want {
        problems.push(format!(
            "comparisons is {got}; CompareParent + CompareChildren steps: {want}"
        ));
    }
    let (got, want) = (result.swaps as usize, count_swaps(steps));
    if got != want {
        problems.push(format!("swaps is {got}; Swap steps: {want}"));
    }
    check_links(steps, &mut problems);
    match replay(order, cap, before, steps) {
        Ok(arr) if arr != result.items => problems.push(format!(
            "replaying the steps from the old items gives {arr:?}, but items is {:?}",
            result.items
        )),
        Ok(_) => {}
        Err(why) => problems.push(format!("replaying the steps: {why}")),
    }
    if let Some(i) = violation(order, &result.items) {
        problems.push(format!(
            "items isn't a valid heap for this order: index {i} is better than its parent {}",
            (i - 1) / 2
        ));
    }
    check_op((order, cap, before, op), result, &mut problems);
    let problems = problems.join("\n  - ");
    assert!(
        problems.is_empty(),
        "{ctx}: step-log invariants broken:\n  - {problems}\nitems before {before:?}, after {:?}\n\
         log:\n{}\n{LEGEND}",
        result.items,
        show_log(steps)
    );
}
