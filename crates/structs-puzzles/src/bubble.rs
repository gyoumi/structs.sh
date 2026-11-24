//! "Bubble: exactly k passes, with the most swaps" puzzle template.
//!
//! # Algorithm
//!
//! [`Bubble::run`](crate::Template::run) runs `bubble.ts` from the sorting
//! visualiser:
//!
//! - For each outer pass `i` in `0..n - 1`, compare `a[j] < a[j - 1]` for
//!   `j` in `1..n - i`, and swap the pair when it holds.
//! - Stop after a pass that made no swaps.
//!
//! A pass is an outer iteration that makes at least one comparison, so the
//! final pass with no swaps counts and there are at most `n - 1` passes.
//! Arrays of length 0 and 1 make no passes.
//!
//! # Step log and score
//!
//! - [`Step::Compare`] for every comparison of `a[j - 1]` (`left`) and `a[j]`
//!   (`right`).
//! - [`Step::Swap`] for every swap of those two slots.
//! - [`Step::PassEnd`] at the end of each pass, with its 1-based number and
//!   the swaps it made.
//!
//! A try is solved when the pass count equals `target_passes`. A solved try
//! scores its total swaps, and an unsolved try scores `0`.
//!
//! # Validation
//!
//! Inputs are validated in [`InputError`] order.

use crate::validate::{count, validate};
use crate::{InputError, Template};

/// Bubble sort puzzle template (`ID = "bubble-exact-passes"`).
pub struct Bubble;

/// A bubble sort puzzle instance.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Instance {
    /// Distinct values that the player's input must rearrange.
    pub values: Vec<i32>,
    /// Indices into `values` whose values must remain unchanged.
    pub fixed: Vec<usize>,
    /// The number of passes that solves the puzzle.
    pub target_passes: u32,
}

/// One recorded event during bubble sort.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Step {
    /// A comparison of `a[right] < a[left]`, where `left + 1 == right`.
    Compare { left: usize, right: usize },
    /// A swap of the neighbouring slots `left` and `right`.
    Swap { left: usize, right: usize },
    /// The end of 1-based pass `pass`, which made `swaps` swaps.
    PassEnd { pass: u32, swaps: u32 },
}

/// What one bubble sort try did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Outcome {
    /// Outer passes that made at least one comparison.
    pub passes: u32,
    /// Swaps across every pass.
    pub swaps: u32,
    /// Whether `passes` equals the instance's `target_passes`.
    pub solved: bool,
}

impl Bubble {
    /// Validates `input`, runs bubble sort on it, and reports its passes and
    /// swaps.
    pub fn evaluate(&self, instance: &Instance, input: &[i32]) -> Result<Outcome, InputError> {
        validate(&instance.values, &instance.fixed, input)?;
        let steps = sort(input);
        let passes = count(
            steps
                .iter()
                .filter(|step| matches!(step, Step::PassEnd { .. }))
                .count(),
        );
        let swaps = count(
            steps
                .iter()
                .filter(|step| matches!(step, Step::Swap { .. }))
                .count(),
        );
        Ok(Outcome {
            passes,
            swaps,
            solved: passes == instance.target_passes,
        })
    }
}

impl Template for Bubble {
    type Instance = Instance;
    type Input = Vec<i32>;
    type Step = Step;

    const ID: &'static str = "bubble-exact-passes";

    fn rules(&self, instance: &Self::Instance) -> String {
        format!(
            "Arrange the free values so bubble sort takes exactly {} passes, with as many swaps \
             as possible. Fixed values stay where they are.",
            instance.target_passes
        )
    }

    fn run(
        &self,
        instance: &Self::Instance,
        input: &Self::Input,
    ) -> Result<Vec<Self::Step>, InputError> {
        validate(&instance.values, &instance.fixed, input)?;
        Ok(sort(input))
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
        Ok(outcome.solved.then_some(outcome.swaps))
    }
}

fn sort(input: &[i32]) -> Vec<Step> {
    let mut a = input.to_vec();
    let n = a.len();
    let mut steps = Vec::new();
    for (i, pass) in (0..n.saturating_sub(1)).zip(1..) {
        let mut swaps = 0;
        for j in 1..n - i {
            steps.push(Step::Compare {
                left: j - 1,
                right: j,
            });
            if a[j] < a[j - 1] {
                a.swap(j - 1, j);
                steps.push(Step::Swap {
                    left: j - 1,
                    right: j,
                });
                swaps += 1;
            }
        }
        steps.push(Step::PassEnd { pass, swaps });
        if swaps == 0 {
            break;
        }
    }
    steps
}
