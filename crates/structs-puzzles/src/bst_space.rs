//! Insert orders that build one fixed BST, for the forced order template.
//!
//! An order builds the tree exactly when every key comes after its parent,
//! so the valid orders are the topological orders of the tree.

use std::collections::{BTreeMap, VecDeque};

use crate::rng::Rng;

/// A BST's shape: its root and each key's left and right children.
#[derive(Clone)]
pub(crate) struct Shape {
    root: Option<i32>,
    children: BTreeMap<i32, [Option<i32>; 2]>,
}

impl Shape {
    /// Rebuilds the tree from its preorder, which fixes every node's
    /// children for distinct keys.
    pub(crate) fn from_preorder(preorder: &[i32]) -> Self {
        let mut shape = Self {
            root: preorder.first().copied(),
            children: BTreeMap::new(),
        };
        for &key in preorder {
            shape.attach(key);
        }
        shape
    }

    fn attach(&mut self, key: i32) {
        let Some(mut node) = self.root else {
            return;
        };
        while node != key {
            let side = usize::from(key > node);
            let slot = &mut self.children.entry(node).or_default()[side];
            match *slot {
                Some(next) => node = next,
                None => {
                    *slot = Some(key);
                    return;
                }
            }
        }
    }

    fn kids(&self, key: i32) -> impl Iterator<Item = i32> + '_ {
        self.children
            .get(&key)
            .into_iter()
            .flatten()
            .flatten()
            .copied()
    }

    fn is_parent(&self, parent: i32, child: i32) -> bool {
        self.kids(parent).any(|kid| kid == child)
    }

    fn roots(&self) -> Vec<i32> {
        self.root.into_iter().collect()
    }

    /// Lazily yields every insert order that builds this tree.
    pub(crate) fn orders(self) -> Box<dyn Iterator<Item = Vec<i32>>> {
        let frontier = self.roots();
        Box::new(Orders {
            shape: self,
            stack: vec![(frontier, 0)],
            prefix: Vec::new(),
        })
    }

    /// Builds an order by repeatedly taking the key `pick` chooses from the
    /// sorted frontier of keys whose parents are already placed.
    fn order_by(&self, mut pick: impl FnMut(&[i32]) -> usize) -> Vec<i32> {
        let mut frontier = self.roots();
        let mut out = Vec::new();
        while !frontier.is_empty() {
            let key = frontier.remove(pick(&frontier));
            out.push(key);
            frontier.extend(self.kids(key));
            frontier.sort_unstable();
        }
        out
    }

    /// The order that always takes the smallest available key.
    pub(crate) fn min_available(&self) -> Vec<i32> {
        self.order_by(|_| 0)
    }

    /// A random valid order, determined by `seed`.
    pub(crate) fn random_order(&self, seed: u64) -> Vec<i32> {
        let mut rng = Rng::new(seed);
        self.order_by(|frontier| rng.gen_range(frontier.len()))
    }

    /// The tree's keys level by level, left to right.
    pub(crate) fn level_order(&self) -> Vec<i32> {
        let mut queue: VecDeque<i32> = self.roots().into();
        let mut out = Vec::new();
        while let Some(key) = queue.pop_front() {
            out.push(key);
            queue.extend(self.kids(key));
        }
        out
    }

    /// `input` with one pair of neighbouring, unrelated keys (chosen by
    /// `seed`) swapped, which keeps a valid order valid.
    pub(crate) fn neighbor(&self, input: &[i32], seed: u64) -> Vec<i32> {
        let swappable: Vec<usize> = input
            .windows(2)
            .enumerate()
            .filter(|(_, pair)| {
                !self.is_parent(pair[0], pair[1]) && !self.is_parent(pair[1], pair[0])
            })
            .map(|(index, _)| index)
            .collect();
        let mut out = input.to_vec();
        if !swappable.is_empty() {
            let index = swappable[Rng::new(seed).gen_range(swappable.len())];
            out.swap(index, index + 1);
        }
        out
    }
}

/// Depth-first walk over choices: each stack frame holds the frontier left
/// to choose from and the next choice to try; frames past the first each
/// match one key of `prefix`.
struct Orders {
    shape: Shape,
    stack: Vec<(Vec<i32>, usize)>,
    prefix: Vec<i32>,
}

impl Iterator for Orders {
    type Item = Vec<i32>;

    fn next(&mut self) -> Option<Vec<i32>> {
        loop {
            let (frontier, choice) = self.stack.last_mut()?;
            if frontier.is_empty() || *choice >= frontier.len() {
                let complete = frontier.is_empty().then(|| self.prefix.clone());
                self.stack.pop();
                self.prefix.pop();
                if complete.is_some() {
                    return complete;
                }
                continue;
            }
            let mut next = frontier.clone();
            let key = next.remove(*choice);
            *choice += 1;
            next.extend(self.shape.kids(key));
            self.prefix.push(key);
            self.stack.push((next, 0));
        }
    }
}
