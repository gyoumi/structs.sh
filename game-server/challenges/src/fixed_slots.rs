//! Generation, search, and shortcut helpers shared by templates whose input
//! rearranges `values` while `fixed` slots stay put.

use crate::rng::Rng;
use crate::search::Shortcut;
use crate::validate::validate;

/// Whether every fixed index is in bounds for an array of length `len`.
pub(crate) fn valid_fixed(len: usize, fixed: &[usize]) -> bool {
    fixed.iter().all(|&slot| slot < len)
}

/// A shuffled permutation of `1..=n` and `fixed_count` sorted distinct fixed
/// slots, both determined by `seed`.
pub(crate) fn generate_fixed_instance(
    n: usize,
    fixed_count: usize,
    seed: u64,
) -> (Vec<i32>, Vec<usize>) {
    let mut rng = Rng::new(seed);
    let mut values: Vec<i32> = (1..=i32::try_from(n).unwrap_or(i32::MAX)).collect();
    rng.shuffle(&mut values);
    let fixed = rng.sample_indices(n, fixed_count);
    (values, fixed)
}

fn free_slots(len: usize, fixed: &[usize]) -> Vec<usize> {
    (0..len).filter(|slot| !fixed.contains(slot)).collect()
}

fn sorted_values_at(values: &[i32], slots: &[usize]) -> Vec<i32> {
    let mut free: Vec<i32> = slots.iter().map(|&slot| values[slot]).collect();
    free.sort_unstable();
    free
}

fn fill_slots(values: &[i32], slots: &[usize], free_vals: &[i32]) -> Vec<i32> {
    let mut out = values.to_vec();
    for (&slot, &value) in slots.iter().zip(free_vals) {
        out[slot] = value;
    }
    out
}

/// Every distinct arrangement of the free values, with fixed slots held in
/// place, in lexicographic order of the free values, or empty if any fixed
/// slot is out of range.
pub(crate) fn exhaustive_free_permutations(
    values: &[i32],
    fixed: &[usize],
) -> Box<dyn Iterator<Item = Vec<i32>>> {
    if !valid_fixed(values.len(), fixed) {
        return Box::new(std::iter::empty());
    }
    let slots = free_slots(values.len(), fixed);
    let next = Some(sorted_values_at(values, &slots));
    Box::new(FreePermutations {
        values: values.to_vec(),
        slots,
        next,
    })
}

struct FreePermutations {
    values: Vec<i32>,
    slots: Vec<usize>,
    next: Option<Vec<i32>>,
}

impl Iterator for FreePermutations {
    type Item = Vec<i32>;

    fn next(&mut self) -> Option<Vec<i32>> {
        let mut free = self.next.take()?;
        let out = fill_slots(&self.values, &self.slots, &free);
        if next_permutation(&mut free) {
            self.next = Some(free);
        }
        Some(out)
    }
}

/// Advances `items` to its next lexicographic permutation, returning `false`
/// once it was already the last.
fn next_permutation(items: &mut [i32]) -> bool {
    let Some(mut i) = items.len().checked_sub(1) else {
        return false;
    };
    while i > 0 && items[i - 1] >= items[i] {
        i -= 1;
    }
    if i == 0 {
        return false;
    }
    let mut j = items.len() - 1;
    while items[j] <= items[i - 1] {
        j -= 1;
    }
    items.swap(i - 1, j);
    items[i..].reverse();
    true
}

/// A random arrangement of the free values, determined by `seed`, or `None`
/// if any fixed slot is out of range.
pub(crate) fn random_fixed_input(values: &[i32], fixed: &[usize], seed: u64) -> Option<Vec<i32>> {
    if !valid_fixed(values.len(), fixed) {
        return None;
    }
    let slots = free_slots(values.len(), fixed);
    let mut free = sorted_values_at(values, &slots);
    Rng::new(seed).shuffle(&mut free);
    Some(fill_slots(values, &slots, &free))
}

/// `input` with two distinct free slots, chosen by `seed`, swapped, or `None`
/// when `instance` or `input` is invalid.
pub(crate) fn random_fixed_neighbor(
    values: &[i32],
    fixed: &[usize],
    input: &[i32],
    seed: u64,
) -> Option<Vec<i32>> {
    if validate(values, fixed, input).is_err() {
        return None;
    }
    let slots = free_slots(input.len(), fixed);
    let mut out = input.to_vec();
    if slots.len() < 2 {
        return Some(out);
    }
    let mut rng = Rng::new(seed);
    let a = rng.gen_range(slots.len());
    let mut b = rng.gen_range(slots.len() - 1);
    if b >= a {
        b += 1;
    }
    out.swap(slots[a], slots[b]);
    Some(out)
}

/// A shortcut whose free slots hold `order` applied to the sorted free values.
pub(crate) fn shortcut(
    name: &'static str,
    values: &[i32],
    fixed: &[usize],
    order: impl FnOnce(Vec<i32>) -> Vec<i32>,
) -> Shortcut<Vec<i32>> {
    let slots = free_slots(values.len(), fixed);
    let free = order(sorted_values_at(values, &slots));
    Shortcut {
        name,
        input: fill_slots(values, &slots, &free),
    }
}

/// The sorted values, unchanged.
pub(crate) fn ascending(sorted: Vec<i32>) -> Vec<i32> {
    sorted
}

/// The sorted values, largest first.
pub(crate) fn descending(mut sorted: Vec<i32>) -> Vec<i32> {
    sorted.reverse();
    sorted
}

/// Smallest, largest, next smallest, next largest, and so on.
pub(crate) fn zigzag(sorted: Vec<i32>) -> Vec<i32> {
    let mut out = Vec::with_capacity(sorted.len());
    let (mut lo, mut hi) = (0, sorted.len());
    while lo < hi {
        out.push(sorted[lo]);
        lo += 1;
        if lo < hi {
            hi -= 1;
            out.push(sorted[hi]);
        }
    }
    out
}

/// The smaller half descending, then the larger half descending.
pub(crate) fn desc_halves(sorted: Vec<i32>) -> Vec<i32> {
    let mid = sorted.len() / 2;
    let mut out = descending(sorted[..mid].to_vec());
    out.extend(descending(sorted[mid..].to_vec()));
    out
}

/// The `k - 1` largest values descending, then the rest ascending.
pub(crate) fn bubble_recipe(sorted: Vec<i32>, k: usize) -> Vec<i32> {
    let split = sorted.len().saturating_sub(k.saturating_sub(1));
    let mut out = descending(sorted[split..].to_vec());
    out.extend_from_slice(&sorted[..split]);
    out
}

/// The smallest value last, with the rest ordered by `rest`.
pub(crate) fn smallest_last(sorted: Vec<i32>, rest: fn(Vec<i32>) -> Vec<i32>) -> Vec<i32> {
    let Some((&smallest, others)) = sorted.split_first() else {
        return sorted;
    };
    let mut out = rest(others.to_vec());
    out.push(smallest);
    out
}
