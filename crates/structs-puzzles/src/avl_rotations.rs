//! "AVL: most rotations" puzzle template.
//!
//! # Algorithm
//!
//! [`AvlRotations::run`](crate::Template::run) inserts the input's keys, in
//! slot order, into an empty AVL tree, as `GraphicalAVL.ts` does (see the
//! `tree` module for the rebalancing rules).
//!
//! # Step log and score
//!
//! - [`Step::Visit`] for every existing node a key is compared with on its
//!   way down, including the node equal to a duplicate key.
//! - [`Step::Insert`] for every new leaf.
//! - [`Step::RotateLeft`] and [`Step::RotateRight`] for every single
//!   rotation, naming the subtree's root before it rotates down.
//!
//! Every try is solved, and scores its single rotations: LL and RR cases
//! count 1, LR and RL double rotations count 2.
//!
//! # Validation
//!
//! Inputs are validated in [`InputError`] order.

use crate::fixed_slots::{
    ascending, descending, exhaustive_free_permutations, generate_fixed_instance,
    random_fixed_input, random_fixed_neighbor, shortcut,
};
use crate::tree::{self, Event};
use crate::validate::{count, validate};
use crate::{InputError, SearchSpace, Shortcut, Template};

/// AVL rotations puzzle template (`ID = "avl-most-rotations"`).
pub struct AvlRotations;

/// An AVL rotations puzzle instance.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Instance {
    /// Distinct keys that the player's input must rearrange.
    pub values: Vec<i32>,
    /// Indices into `values` whose keys must remain unchanged.
    pub fixed: Vec<usize>,
}

/// One recorded event while the keys are inserted.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Step {
    /// `key` was compared with the existing node `existing`.
    Visit { key: i32, existing: i32 },
    /// `key` was added as a new leaf.
    Insert { key: i32 },
    /// A left rotation of the subtree whose root was `pivot`.
    RotateLeft { pivot: i32 },
    /// A right rotation of the subtree whose root was `pivot`.
    RotateRight { pivot: i32 },
}

/// What one try did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Outcome {
    /// Single rotations across every insert.
    pub rotations: u32,
}

impl From<Event> for Step {
    fn from(event: Event) -> Self {
        match event {
            Event::Visit { key, existing } => Self::Visit { key, existing },
            Event::Insert { key } => Self::Insert { key },
            Event::RotateLeft { pivot } => Self::RotateLeft { pivot },
            Event::RotateRight { pivot } => Self::RotateRight { pivot },
        }
    }
}

impl AvlRotations {
    /// Validates `input`, inserts its keys into an AVL tree, and reports the
    /// rotations.
    pub fn evaluate(&self, instance: &Instance, input: &[i32]) -> Result<Outcome, InputError> {
        let steps = self.run(instance, &input.to_vec())?;
        let rotations = count(
            steps
                .iter()
                .filter(|step| matches!(step, Step::RotateLeft { .. } | Step::RotateRight { .. }))
                .count(),
        );
        Ok(Outcome { rotations })
    }
}

impl Template for AvlRotations {
    type Instance = Instance;
    type Input = Vec<i32>;
    type Step = Step;

    const ID: &'static str = "avl-most-rotations";

    fn rules(&self, _instance: &Self::Instance) -> String {
        "Arrange the free keys so inserting them in order into an empty AVL tree makes as many \
         rotations as possible. A double rotation counts as two. Fixed keys stay where they are."
            .to_owned()
    }

    fn run(
        &self,
        instance: &Self::Instance,
        input: &Self::Input,
    ) -> Result<Vec<Self::Step>, InputError> {
        validate(&instance.values, &instance.fixed, input)?;
        let mut events = Vec::new();
        tree::build_avl(input, &mut events);
        Ok(events.into_iter().map(Step::from).collect())
    }

    fn score(&self, instance: &Self::Instance, input: &Self::Input) -> Result<u32, InputError> {
        Ok(self.evaluate(instance, input)?.rotations)
    }

    fn generate(&self, seed: u64) -> Self::Instance {
        let (values, fixed) = generate_fixed_instance(9, 3, seed);
        Instance { values, fixed }
    }

    fn search_space(&self, instance: &Self::Instance) -> SearchSpace<Self::Input> {
        SearchSpace::Exhaustive(exhaustive_free_permutations(
            &instance.values,
            &instance.fixed,
        ))
    }

    fn shortcuts(&self, instance: &Self::Instance) -> Vec<Shortcut<Self::Input>> {
        let (values, fixed) = (&instance.values, &instance.fixed);
        vec![
            shortcut("ascending", values, fixed, ascending),
            shortcut("descending", values, fixed, descending),
        ]
    }

    fn random_input(&self, instance: &Self::Instance, seed: u64) -> Self::Input {
        random_fixed_input(&instance.values, &instance.fixed, seed)
    }

    fn random_neighbor(
        &self,
        instance: &Self::Instance,
        input: &Self::Input,
        seed: u64,
    ) -> Self::Input {
        random_fixed_neighbor(&instance.fixed, input, seed)
    }
}
