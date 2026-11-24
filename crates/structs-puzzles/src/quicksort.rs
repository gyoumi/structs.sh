//! "Quicksort: the most comparisons" puzzle template.
//!
//! # Algorithm
//!
//! [`Quicksort::run`](crate::Template::run) executes `quicksort(a, 0, n - 1)`
//! matching `quickCodeSnippet` in
//! `client/src/visualiser-src/sorting-visualiser/util/codeSnippets.ts`:
//!
//! - If `hi <= lo`, return immediately. Arrays of length 0 and 1 emit no steps
//!   and score `0`.
//! - `partition(a, lo, hi)`:
//!   - `v = a[lo]` (the pivot), `i = lo + 1`, `j = hi`.
//!   - Loop forever:
//!     - `while (a[i] <= v && i < j) i++;`
//!     - `while (v < a[j] && j > i) j--;`
//!     - `if (i == j) break;`
//!     - `swap(a, i, j);`
//!   - `j = a[i] < v ? i : i - 1;`
//!   - `swap(a, lo, j);`
//!   - Return `j`.
//! - Recurse left `quicksort(a, lo, j - 1)`, then right
//!   `quicksort(a, j + 1, hi)`.
//!
//! # Step log and score
//!
//! - [`Step::Compare`] is logged for every evaluation of `a[i] <= v` and
//!   `v < a[j]`, including the evaluation that ends each `while` loop (the
//!   value comparison is on the left-hand side of `&&`, so it always runs),
//!   plus one for `a[i] < v` after each partition loop. `index` is the slot
//!   compared with `v`, and `pivot` is `v`. Index checks (`i < j`, `j > i`,
//!   `i == j`, `hi <= lo`) are not logged.
//! - [`Step::Swap`] is logged for every `swap` call (both inside the partition
//!   loop and the final `swap(a, lo, j)`), including when `i == j`.
//! - [`Quicksort::score`](crate::Template::score) is the number of
//!   [`Step::Compare`] entries in `run`'s step log.
//! - Applying every [`Step::Swap`] in order to the input sorts it ascending.
//!
//! # Validation
//!
//! Inputs are validated in [`InputError`] order:
//! 1. [`InputError::WrongLength`] if `input.len() != instance.values.len()`.
//! 2. [`InputError::FixedValueMoved`] for the smallest index in
//!    `instance.fixed` where `input[index] != instance.values[index]`.
//! 3. [`InputError::NotAPermutation`] if `input` is not a rearrangement of
//!    `instance.values`.
//!
//! Instances are assumed to have distinct values and valid fixed indices.
//!
//! # Rules text
//!
//! [`Quicksort::rules`](crate::Template::rules) returns plain text containing
//! these two exact sentences:
//! - `Arrange the free values so quicksort makes as many comparisons as possible.`
//! - `Fixed values stay where they are.`

use crate::fixed_slots::{
    ascending, descending, exhaustive_free_permutations, generate_fixed_instance,
    random_fixed_input, random_fixed_neighbor, shortcut, valid_fixed, zigzag,
};
use crate::validate::validate;
use crate::{InputError, SearchSpace, Shortcut, Template};

/// Quicksort puzzle template (`ID = "quicksort-most-comparisons"`).
///
/// Implements [`Template`] with `Instance = quicksort::Instance`,
/// `Input = Vec<i32>`, and `Step = quicksort::Step`.
pub struct Quicksort;

/// A quicksort puzzle instance: the starting array values and the indices
/// whose values cannot be moved.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Instance {
    /// Distinct values that the player's input must rearrange.
    pub values: Vec<i32>,
    /// Indices into `values` whose values must remain unchanged.
    pub fixed: Vec<usize>,
}

/// One recorded event during quicksort execution.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Step {
    /// A value comparison between `a[index]` and the partition's `pivot`.
    Compare { index: usize, pivot: i32 },
    /// A swap of slots `i` and `j` (logged even when `i == j`).
    Swap { i: usize, j: usize },
}

impl Template for Quicksort {
    type Instance = Instance;
    type Input = Vec<i32>;
    type Step = Step;

    const ID: &'static str = "quicksort-most-comparisons";

    fn rules(&self, _instance: &Self::Instance) -> String {
        "Arrange the free values so quicksort makes as many comparisons as possible. \
         Fixed values stay where they are."
            .to_owned()
    }

    fn run(
        &self,
        instance: &Self::Instance,
        input: &Self::Input,
    ) -> Result<Vec<Self::Step>, InputError> {
        validate(&instance.values, &instance.fixed, input)?;
        let mut run = Run {
            a: input.clone(),
            steps: Vec::new(),
        };
        if let Some(hi) = input.len().checked_sub(1) {
            run.quicksort(0, hi);
        }
        Ok(run.steps)
    }

    fn score(&self, instance: &Self::Instance, input: &Self::Input) -> Result<u32, InputError> {
        let compares = self
            .run(instance, input)?
            .iter()
            .filter(|step| matches!(step, Step::Compare { .. }))
            .count();
        Ok(u32::try_from(compares).unwrap_or(u32::MAX))
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
        if !valid_fixed(values.len(), fixed) {
            return Vec::new();
        }
        vec![
            shortcut("ascending", values, fixed, ascending),
            shortcut("descending", values, fixed, descending),
            shortcut("zigzag", values, fixed, zigzag),
        ]
    }

    fn random_input(&self, instance: &Self::Instance, seed: u64) -> Option<Self::Input> {
        random_fixed_input(&instance.values, &instance.fixed, seed)
    }

    fn random_neighbor(
        &self,
        instance: &Self::Instance,
        input: &Self::Input,
        seed: u64,
    ) -> Option<Self::Input> {
        random_fixed_neighbor(&instance.values, &instance.fixed, input, seed)
    }
}

struct Run {
    a: Vec<i32>,
    steps: Vec<Step>,
}

impl Run {
    fn quicksort(&mut self, lo: usize, hi: usize) {
        if hi <= lo {
            return;
        }
        let j = self.partition(lo, hi);
        if j > lo + 1 {
            self.quicksort(lo, j - 1);
        }
        self.quicksort(j + 1, hi);
    }

    fn partition(&mut self, lo: usize, hi: usize) -> usize {
        let v = self.a[lo];
        let mut i = lo + 1;
        let mut j = hi;
        loop {
            while self.le(i, v) && i < j {
                i += 1;
            }
            while self.lt_pivot(j, v) && j > i {
                j -= 1;
            }
            if i == j {
                break;
            }
            self.swap(i, j);
        }
        self.steps.push(Step::Compare { index: i, pivot: v });
        let j = if self.a[i] < v { i } else { i - 1 };
        self.swap(lo, j);
        j
    }

    fn le(&mut self, index: usize, pivot: i32) -> bool {
        self.steps.push(Step::Compare { index, pivot });
        self.a[index] <= pivot
    }

    fn lt_pivot(&mut self, index: usize, pivot: i32) -> bool {
        self.steps.push(Step::Compare { index, pivot });
        pivot < self.a[index]
    }

    fn swap(&mut self, i: usize, j: usize) {
        self.steps.push(Step::Swap { i, j });
        self.a.swap(i, j);
    }
}
