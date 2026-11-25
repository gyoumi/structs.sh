//! "Forced order" challenge template.
//!
//! # Algorithm
//!
//! [`BstForcedOrder::run`](crate::Template::run) inserts the input's keys, in
//! slot order, into an empty plain BST, as `GraphicalBST.ts` does.
//!
//! # Step log and score
//!
//! - [`Step::Visit`] for every existing node a key is compared with on its
//!   way down, including the node equal to a duplicate key.
//! - [`Step::Insert`] for every new leaf.
//!
//! A try is solved when the tree's preorder equals `target_tree`. A solved
//! try scores the longest run of neighbouring slots whose keys strictly
//! increase, and an unsolved try scores `0`.
//!
//! # Validation
//!
//! No slot is fixed. Inputs are validated in [`InputError`] order.

use crate::bst_space::Shape;
use crate::rng::Rng;
use crate::tree::{self, Event};
use crate::validate::{count, validate};
use crate::{InputError, SearchSpace, Shortcut, Template};

/// Forced order challenge template (`ID = "bst-forced-order"`).
pub struct BstForcedOrder;

/// A forced order challenge instance.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Instance {
    /// Distinct keys that the player's input must rearrange.
    pub values: Vec<i32>,
    /// The preorder of the tree the player's insert order has to build.
    pub target_tree: Vec<i32>,
}

/// One recorded event while the keys are inserted.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Step {
    /// `key` was compared with the existing node `existing`.
    Visit { key: i32, existing: i32 },
    /// `key` was added as a new leaf.
    Insert { key: i32 },
}

/// What one try did.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Outcome {
    /// Whether `preorder` equals the instance's `target_tree`.
    pub solved: bool,
    /// The longest run of neighbouring slots whose keys strictly increase.
    pub longest_increasing_run: u32,
    /// The preorder of the tree the input built.
    pub preorder: Vec<i32>,
}

impl BstForcedOrder {
    /// Validates `input`, inserts its keys into a BST, and reports whether
    /// it built the target tree and the input's longest increasing run.
    pub fn evaluate(&self, instance: &Instance, input: &[i32]) -> Result<Outcome, InputError> {
        validate(&instance.values, &[], input)?;
        let root = tree::build_bst_unlogged(input);
        let preorder = tree::preorder(&root);
        Ok(Outcome {
            solved: preorder == instance.target_tree,
            longest_increasing_run: longest_increasing_run(input),
            preorder,
        })
    }
}

impl Template for BstForcedOrder {
    type Instance = Instance;
    type Input = Vec<i32>;
    type Step = Step;

    const ID: &'static str = "bst-forced-order";

    fn rules(&self, _instance: &Self::Instance) -> String {
        "Arrange the keys so inserting them in order into an empty BST builds the target tree, \
         with the longest run of increasing keys you can."
            .to_owned()
    }

    fn run(
        &self,
        instance: &Self::Instance,
        input: &Self::Input,
    ) -> Result<Vec<Self::Step>, InputError> {
        validate(&instance.values, &[], input)?;
        let mut events = Vec::new();
        tree::build_bst(input, &mut events);
        Ok(events
            .into_iter()
            .filter_map(|event| match event {
                Event::Visit { key, existing } => Some(Step::Visit { key, existing }),
                Event::Insert { key } => Some(Step::Insert { key }),
                Event::RotateLeft { .. } | Event::RotateRight { .. } => None,
            })
            .collect())
    }

    fn score(&self, instance: &Self::Instance, input: &Self::Input) -> Result<u32, InputError> {
        Ok(self.solved_score(instance, input)?.unwrap_or(0))
    }

    fn solved_score(
        &self,
        instance: &Self::Instance,
        input: &Self::Input,
    ) -> Result<Option<u32>, InputError> {
        let outcome = self.evaluate(instance, input)?;
        Ok(outcome.solved.then_some(outcome.longest_increasing_run))
    }

    fn generate(&self, seed: u64) -> Self::Instance {
        let mut rng = Rng::new(seed);
        let mut values: Vec<i32> = (1..=KEYS).collect();
        rng.shuffle(&mut values);
        let mut order = values.clone();
        rng.shuffle(&mut order);
        let target_tree = tree::preorder(&tree::build_bst_unlogged(&order));
        Instance {
            values,
            target_tree,
        }
    }

    fn search_space(&self, instance: &Self::Instance) -> SearchSpace<Self::Input> {
        match Shape::from_verified(&instance.values, &instance.target_tree) {
            Some(shape) => SearchSpace::Exhaustive(shape.orders()),
            None => SearchSpace::Exhaustive(Box::new(std::iter::empty())),
        }
    }

    fn shortcuts(&self, instance: &Self::Instance) -> Vec<Shortcut<Self::Input>> {
        let Some(shape) = Shape::from_verified(&instance.values, &instance.target_tree) else {
            return Vec::new();
        };
        vec![
            Shortcut {
                name: "preorder",
                input: instance.target_tree.clone(),
            },
            Shortcut {
                name: "levelorder",
                input: shape.level_order(),
            },
            Shortcut {
                name: "min-available",
                input: shape.min_available(),
            },
        ]
    }

    fn random_input(&self, instance: &Self::Instance, seed: u64) -> Option<Self::Input> {
        Shape::from_verified(&instance.values, &instance.target_tree)
            .map(|shape| shape.random_order(seed))
    }

    fn random_neighbor(
        &self,
        instance: &Self::Instance,
        input: &Self::Input,
        seed: u64,
    ) -> Option<Self::Input> {
        let shape = Shape::from_verified(&instance.values, &instance.target_tree)?;
        if !self.evaluate(instance, input).is_ok_and(|o| o.solved) {
            return None;
        }
        Some(shape.neighbor(input, seed))
    }
}

const KEYS: i32 = 10;

/// Whether `target_tree` is a canonical BST preorder over the distinct keys in
/// `values`.
pub fn is_valid_target_tree(values: &[i32], target_tree: &[i32]) -> bool {
    if !is_valid_bst_preorder(target_tree) {
        return false;
    }
    let mut want = values.to_vec();
    want.sort_unstable();
    want.dedup();
    let mut got = target_tree.to_vec();
    got.sort_unstable();
    got == want
}

fn is_valid_bst_preorder(keys: &[i32]) -> bool {
    let mut stack: Vec<i32> = Vec::with_capacity(keys.len());
    let mut lower: Option<i32> = None;
    for &key in keys {
        if lower.is_some_and(|bound| key <= bound) {
            return false;
        }
        while let Some(&top) = stack.last() {
            if key == top {
                return false;
            }
            if key > top {
                lower = stack.pop();
            } else {
                break;
            }
        }
        stack.push(key);
    }
    true
}

fn longest_increasing_run(keys: &[i32]) -> u32 {
    let mut longest = 0;
    let mut run = 0;
    for (index, &key) in keys.iter().enumerate() {
        run = if index > 0 && keys[index - 1] < key {
            run + 1
        } else {
            1
        };
        longest = longest.max(run);
    }
    count(longest)
}
