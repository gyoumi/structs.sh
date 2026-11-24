//! "Upset: BST builds cheaper" puzzle template.
//!
//! # Algorithms
//!
//! [`UpsetBstBeatsAvl::run`](crate::Template::run) inserts the input's keys,
//! in slot order, into an empty plain BST (as `GraphicalBST.ts` does) and
//! into an empty AVL tree (as `GraphicalAVL.ts` does).
//!
//! # Step log and score
//!
//! The BST's steps come first, then the AVL tree's.
//!
//! - [`Step::Visit`] for every existing node a key is compared with on its
//!   way down, including the node equal to a duplicate key. These are the
//!   nodes passed, so the first key passes 0.
//! - [`Step::Insert`] for every new leaf.
//! - [`Step::RotateLeft`] and [`Step::RotateRight`] for every AVL rotation.
//!   Rotations are not nodes passed.
//!
//! A try is solved when the BST passes strictly fewer nodes than the AVL
//! tree. A solved try scores the margin between them, and an unsolved try
//! scores `0`.
//!
//! # Validation
//!
//! Inputs are validated in [`InputError`] order.

use crate::tree::{self, Event};
use crate::validate::{count, validate};
use crate::{InputError, Template};

/// Upset puzzle template (`ID = "upset-bst-beats-avl"`).
pub struct UpsetBstBeatsAvl;

/// An upset puzzle instance.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Instance {
    /// Distinct keys that the player's input must rearrange.
    pub values: Vec<i32>,
    /// Indices into `values` whose keys must remain unchanged.
    pub fixed: Vec<usize>,
}

/// The tree a [`Step::Visit`] or [`Step::Insert`] belongs to.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TreeKind {
    /// The plain BST.
    Bst,
    /// The AVL tree.
    Avl,
}

/// One recorded event while the keys are inserted into both trees.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Step {
    /// `key` was compared with the existing node `existing` in `tree`.
    Visit {
        tree: TreeKind,
        key: i32,
        existing: i32,
    },
    /// `key` was added to `tree` as a new leaf.
    Insert { tree: TreeKind, key: i32 },
    /// A left rotation in the AVL tree of the subtree whose root was `pivot`.
    RotateLeft { pivot: i32 },
    /// A right rotation in the AVL tree of the subtree whose root was `pivot`.
    RotateRight { pivot: i32 },
}

/// What one try did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Outcome {
    /// Whether the BST passed strictly fewer nodes than the AVL tree.
    pub solved: bool,
    /// Existing nodes the BST inserts compared with.
    pub bst_nodes_passed: u32,
    /// Existing nodes the AVL inserts compared with.
    pub avl_nodes_passed: u32,
    /// `avl_nodes_passed - bst_nodes_passed`, or 0 when the BST passed more.
    pub margin: u32,
}

fn tagged(tree: TreeKind, event: Event) -> Step {
    match event {
        Event::Visit { key, existing } => Step::Visit {
            tree,
            key,
            existing,
        },
        Event::Insert { key } => Step::Insert { tree, key },
        Event::RotateLeft { pivot } => Step::RotateLeft { pivot },
        Event::RotateRight { pivot } => Step::RotateRight { pivot },
    }
}

impl UpsetBstBeatsAvl {
    /// Validates `input`, inserts its keys into both trees, and reports the
    /// nodes each one passed.
    pub fn evaluate(&self, instance: &Instance, input: &[i32]) -> Result<Outcome, InputError> {
        let steps = self.run(instance, &input.to_vec())?;
        let passed = |wanted: TreeKind| {
            count(
                steps
                    .iter()
                    .filter(|step| matches!(step, Step::Visit { tree, .. } if *tree == wanted))
                    .count(),
            )
        };
        let bst_nodes_passed = passed(TreeKind::Bst);
        let avl_nodes_passed = passed(TreeKind::Avl);
        Ok(Outcome {
            solved: bst_nodes_passed < avl_nodes_passed,
            bst_nodes_passed,
            avl_nodes_passed,
            margin: avl_nodes_passed.saturating_sub(bst_nodes_passed),
        })
    }
}

impl Template for UpsetBstBeatsAvl {
    type Instance = Instance;
    type Input = Vec<i32>;
    type Step = Step;

    const ID: &'static str = "upset-bst-beats-avl";

    fn rules(&self, _instance: &Self::Instance) -> String {
        "Arrange the free keys so inserting them in order passes fewer nodes in a plain BST than \
         in an AVL tree, by as many nodes as possible. Rotations are not counted. Fixed keys stay \
         where they are."
            .to_owned()
    }

    fn run(
        &self,
        instance: &Self::Instance,
        input: &Self::Input,
    ) -> Result<Vec<Self::Step>, InputError> {
        validate(&instance.values, &instance.fixed, input)?;
        let mut bst = Vec::new();
        tree::build_bst(input, &mut bst);
        let mut avl = Vec::new();
        tree::build_avl(input, &mut avl);
        Ok(bst
            .into_iter()
            .map(|event| tagged(TreeKind::Bst, event))
            .chain(avl.into_iter().map(|event| tagged(TreeKind::Avl, event)))
            .collect())
    }

    fn score(&self, instance: &Self::Instance, input: &Self::Input) -> Result<u32, InputError> {
        let outcome = self.evaluate(instance, input)?;
        Ok(if outcome.solved { outcome.margin } else { 0 })
    }
}
