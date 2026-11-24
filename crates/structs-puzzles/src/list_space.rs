//! Generation and search helpers for the index drift template.

use crate::linked_list_index_drift::{Instance, Operation};
use crate::rng::Rng;
use crate::search::SearchSpace;

const START_LEN: usize = 6;
const MAX_VALUE: i32 = 7;

/// A start list of 6 distinct values from `1..=7`, and a target 2 to 4
/// random edits away that always differs from it.
pub(crate) fn generate(seed: u64) -> Instance {
    let mut rng = Rng::new(seed);
    let mut pool: Vec<i32> = (1..=MAX_VALUE).collect();
    rng.shuffle(&mut pool);
    let start = pool[..START_LEN].to_vec();
    let mut target = start.clone();
    for _ in 0..2 + rng.gen_range(3) {
        edit(&mut target, &mut rng);
    }
    if target == start {
        target.swap(0, 1);
    }
    Instance { start, target }
}

fn edit(list: &mut Vec<i32>, rng: &mut Rng) {
    let len = list.len();
    match rng.gen_range(4) {
        0 | 1 => {
            let value = list.remove(rng.gen_range(len));
            list.insert(rng.gen_range(len), value);
        }
        2 => {
            let a = rng.gen_range(len);
            let b = (a + 1 + rng.gen_range(len - 1)) % len;
            list.swap(a, b);
        }
        _ => {
            let unused: Vec<i32> = (1..=MAX_VALUE).filter(|v| !list.contains(v)).collect();
            if !unused.is_empty() {
                list[rng.gen_range(len)] = unused[rng.gen_range(unused.len())];
            }
        }
    }
}

/// Runs `ops` on `start`, or returns `None` if a delete is out of range.
fn replay(start: &[i32], ops: &[Operation]) -> Option<Vec<i32>> {
    let mut list = start.to_vec();
    for &op in ops {
        match op {
            Operation::Insert { value, index } => list.insert(index.min(list.len()), value),
            Operation::Delete { index } => {
                if index >= list.len() {
                    return None;
                }
                list.remove(index);
            }
        }
    }
    Some(list)
}

fn state_key(list: &[i32]) -> Vec<u8> {
    let mut key = u32::try_from(list.len())
        .unwrap_or(u32::MAX)
        .to_le_bytes()
        .to_vec();
    key.extend(list.iter().flat_map(|value| value.to_le_bytes()));
    key
}

fn step_cost(walked: usize) -> u32 {
    u32::try_from(walked + 1).unwrap_or(u32::MAX)
}

fn extensions(instance: &Instance, prefix: &[Operation]) -> Vec<(Vec<Operation>, u32)> {
    let curr = replay(&instance.start, prefix).unwrap_or_default();
    let with = |op: Operation| {
        let mut ops = prefix.to_vec();
        ops.push(op);
        ops
    };
    let mut out: Vec<(Vec<Operation>, u32)> = (0..curr.len())
        .map(|index| (with(Operation::Delete { index }), step_cost(index + 1)))
        .collect();
    let mut needed = instance.target.clone();
    needed.sort_unstable();
    needed.dedup();
    for value in needed {
        let count = |list: &[i32]| list.iter().filter(|&&v| v == value).count();
        if count(&curr) < count(&instance.target) {
            out.extend(
                (0..=curr.len())
                    .map(|index| (with(Operation::Insert { value, index }), step_cost(index))),
            );
        }
    }
    out
}

/// Operation sequences built one operation at a time from an empty one.
pub(crate) fn search_space(instance: &Instance) -> SearchSpace<Vec<Operation>> {
    let start = instance.start.clone();
    let owned = instance.clone();
    SearchSpace::Incremental {
        start: Vec::new(),
        state_key: Box::new(move |ops| state_key(&replay(&start, ops).unwrap_or_default())),
        extend: Box::new(move |ops| extensions(&owned, ops)),
    }
}

/// Deletes from the front down to the shared suffix, then inserts the rest
/// of the target at the front, back to front.
pub(crate) fn cheap_front_rebuild(instance: &Instance) -> Vec<Operation> {
    let (start, target) = (&instance.start, &instance.target);
    let shared = start
        .iter()
        .rev()
        .zip(target.iter().rev())
        .take_while(|(a, b)| a == b)
        .count();
    let deletes = (0..start.len() - shared).map(|_| Operation::Delete { index: 0 });
    let inserts = target[..target.len() - shared]
        .iter()
        .rev()
        .map(|&value| Operation::Insert { value, index: 0 });
    deletes.chain(inserts).collect()
}

fn is_subsequence(list: &[i32], target: &[i32]) -> bool {
    let mut rest = target.iter();
    list.iter().all(|value| rest.any(|t| t == value))
}

/// Random operations turning `list` into `target`: random deletes until
/// `list` is a subsequence of `target`, then the missing target values
/// inserted in random order at their final positions.
fn rebuild(mut list: Vec<i32>, target: &[i32], rng: &mut Rng) -> Vec<Operation> {
    let mut ops = Vec::new();
    while !is_subsequence(&list, target) || (!list.is_empty() && rng.gen_range(4) == 0) {
        let index = rng.gen_range(list.len());
        list.remove(index);
        ops.push(Operation::Delete { index });
    }
    let mut present = vec![false; target.len()];
    let mut from = 0;
    for value in &list {
        while target[from] != *value {
            from += 1;
        }
        present[from] = true;
        from += 1;
    }
    let mut missing: Vec<usize> = (0..target.len()).filter(|&t| !present[t]).collect();
    rng.shuffle(&mut missing);
    for t in missing {
        let index = present[..t].iter().filter(|&&p| p).count();
        present[t] = true;
        ops.push(Operation::Insert {
            value: target[t],
            index,
        });
    }
    ops
}

/// A random operation sequence that reaches the target, determined by `seed`.
pub(crate) fn random_input(instance: &Instance, seed: u64) -> Vec<Operation> {
    rebuild(
        instance.start.clone(),
        &instance.target,
        &mut Rng::new(seed),
    )
}

/// Keeps a random prefix of `input` and rebuilds the rest; when every try
/// gives `input` back, wraps it with a front insert and delete that cancel.
pub(crate) fn random_neighbor(
    instance: &Instance,
    input: &[Operation],
    seed: u64,
) -> Vec<Operation> {
    let mut rng = Rng::new(seed);
    for _ in 0..4 {
        let cut = rng.gen_range(input.len() + 1);
        let (kept, list) = match replay(&instance.start, &input[..cut]) {
            Some(list) => (&input[..cut], list),
            None => (&input[..0], instance.start.clone()),
        };
        let mut ops = kept.to_vec();
        ops.extend(rebuild(list, &instance.target, &mut rng));
        if ops != input {
            return ops;
        }
    }
    let value = instance.target.first().copied().unwrap_or(0);
    let mut ops = vec![
        Operation::Insert { value, index: 0 },
        Operation::Delete { index: 0 },
    ];
    ops.extend_from_slice(input);
    ops
}
