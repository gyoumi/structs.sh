//! Generation, search, and shortcut helpers shared by templates whose input
//! rearranges `values` while `fixed` slots stay put.

use crate::rng::Rng;
use crate::search::Shortcut;

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

fn sorted_free_values(values: &[i32], fixed: &[usize]) -> Vec<i32> {
    let mut free: Vec<i32> = free_slots(values.len(), fixed)
        .into_iter()
        .map(|slot| values[slot])
        .collect();
    free.sort_unstable();
    free
}

/// `values` with its free slots, in order, holding `free_vals`.
pub(crate) fn fill_free(values: &[i32], fixed: &[usize], free_vals: &[i32]) -> Vec<i32> {
    let mut out = values.to_vec();
    for (slot, &value) in free_slots(values.len(), fixed).into_iter().zip(free_vals) {
        out[slot] = value;
    }
    out
}

/// Every distinct arrangement of the free values, with fixed slots held in
/// place, in lexicographic order of the free values.
pub(crate) fn exhaustive_free_permutations(
    values: &[i32],
    fixed: &[usize],
) -> Box<dyn Iterator<Item = Vec<i32>>> {
    Box::new(FreePermutations {
        values: values.to_vec(),
        fixed: fixed.to_vec(),
        next: Some(sorted_free_values(values, fixed)),
    })
}

struct FreePermutations {
    values: Vec<i32>,
    fixed: Vec<usize>,
    next: Option<Vec<i32>>,
}

impl Iterator for FreePermutations {
    type Item = Vec<i32>;

    fn next(&mut self) -> Option<Vec<i32>> {
        let mut free = self.next.take()?;
        let out = fill_free(&self.values, &self.fixed, &free);
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

/// A random arrangement of the free values, determined by `seed`.
pub(crate) fn random_fixed_input(values: &[i32], fixed: &[usize], seed: u64) -> Vec<i32> {
    let mut free = sorted_free_values(values, fixed);
    Rng::new(seed).shuffle(&mut free);
    fill_free(values, fixed, &free)
}

/// `input` with two distinct free slots, chosen by `seed`, swapped.
pub(crate) fn random_fixed_neighbor(fixed: &[usize], input: &[i32], seed: u64) -> Vec<i32> {
    let slots = free_slots(input.len(), fixed);
    let mut out = input.to_vec();
    if slots.len() < 2 {
        return out;
    }
    let mut rng = Rng::new(seed);
    let a = rng.gen_range(slots.len());
    let mut b = rng.gen_range(slots.len() - 1);
    if b >= a {
        b += 1;
    }
    out.swap(slots[a], slots[b]);
    out
}

/// A shortcut whose free slots hold `order` applied to the sorted free values.
pub(crate) fn shortcut(
    name: &'static str,
    values: &[i32],
    fixed: &[usize],
    order: impl FnOnce(Vec<i32>) -> Vec<i32>,
) -> Shortcut<Vec<i32>> {
    let free = order(sorted_free_values(values, fixed));
    Shortcut {
        name,
        input: fill_free(values, fixed, &free),
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
