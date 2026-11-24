//! "Insertion beats merge" puzzle template.
//!
//! # Algorithms
//!
//! Insertion sort follows `insertion.ts` from the sorting visualiser: for
//! each `i` in `1..n`, walk `j` down from `i` to `1`, comparing
//! `val >= a[j - 1]`; stop when it holds, and otherwise swap `a[j]` and
//! `a[j - 1]`.
//!
//! Merge sort follows `merge.ts`: split `lo..=hi` at `(lo + hi) / 2`, sort
//! both halves, then merge them, comparing `a[left] <= a[right]` and taking
//! from the left half on ties.
//!
//! # Step log and score
//!
//! - [`Step::Compare`] for every comparison of two values, tagged with the
//!   algorithm that made it. Insertion sort's steps come first.
//! - [`Step::Swap`] for every insertion sort swap. Each one fixes one
//!   out-of-order pair, so their count is the input's inversions.
//!
//! A try is solved when insertion sort makes strictly fewer comparisons
//! than merge sort. A solved try scores its inversions, and an unsolved try
//! scores `0`.
//!
//! # Validation
//!
//! Inputs are validated in [`InputError`] order.

use crate::fixed_slots::{
    ascending, desc_halves, descending, exhaustive_free_permutations, generate_fixed_instance,
    random_fixed_input, random_fixed_neighbor, shortcut, valid_fixed, zigzag,
};
use crate::validate::{count, validate};
use crate::{InputError, SearchSpace, Shortcut, Template};

/// Insertion beats merge puzzle template (`ID = "insertion-beats-merge"`).
pub struct InsertionBeatsMerge;

/// An insertion beats merge puzzle instance.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Instance {
    /// Distinct values that the player's input must rearrange.
    pub values: Vec<i32>,
    /// Indices into `values` whose values must remain unchanged.
    pub fixed: Vec<usize>,
}

/// The sort a [`Step::Compare`] belongs to.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Algorithm {
    /// Insertion sort.
    Insertion,
    /// Merge sort.
    Merge,
}

/// One recorded event while both sorts run.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Step {
    /// A comparison of two values by `algorithm`.
    Compare { algorithm: Algorithm },
    /// An insertion sort swap of the neighbouring slots `left` and `right`.
    Swap { left: usize, right: usize },
}

/// What one try did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Outcome {
    /// Comparisons insertion sort made.
    pub insertion_comparisons: u32,
    /// Comparisons merge sort made.
    pub merge_comparisons: u32,
    /// Out-of-order pairs in the input.
    pub inversions: u32,
    /// Whether insertion sort made strictly fewer comparisons.
    pub solved: bool,
}

impl InsertionBeatsMerge {
    /// Validates `input`, runs both sorts on it, and reports their
    /// comparisons and the input's inversions.
    pub fn evaluate(&self, instance: &Instance, input: &[i32]) -> Result<Outcome, InputError> {
        let steps = self.run(instance, &input.to_vec())?;
        let compares = |wanted: Algorithm| {
            count(
                steps
                    .iter()
                    .filter(
                        |step| matches!(step, Step::Compare { algorithm } if *algorithm == wanted),
                    )
                    .count(),
            )
        };
        let insertion_comparisons = compares(Algorithm::Insertion);
        let merge_comparisons = compares(Algorithm::Merge);
        let inversions = count(
            steps
                .iter()
                .filter(|step| matches!(step, Step::Swap { .. }))
                .count(),
        );
        Ok(Outcome {
            insertion_comparisons,
            merge_comparisons,
            inversions,
            solved: insertion_comparisons < merge_comparisons,
        })
    }
}

impl Template for InsertionBeatsMerge {
    type Instance = Instance;
    type Input = Vec<i32>;
    type Step = Step;

    const ID: &'static str = "insertion-beats-merge";

    fn rules(&self, _instance: &Self::Instance) -> String {
        "Arrange the free values so insertion sort makes fewer comparisons than merge sort, with \
         as many out-of-order pairs as possible. Fixed values stay where they are."
            .to_owned()
    }

    fn run(
        &self,
        instance: &Self::Instance,
        input: &Self::Input,
    ) -> Result<Vec<Self::Step>, InputError> {
        validate(&instance.values, &instance.fixed, input)?;
        let mut steps = Vec::new();
        insertion(&mut input.clone(), &mut steps);
        let mut a = input.clone();
        let mut scratch = input.clone();
        if let Some(hi) = a.len().checked_sub(1) {
            merge_range(&mut a, &mut scratch, 0, hi, &mut steps);
        }
        Ok(steps)
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
        Ok(outcome.solved.then_some(outcome.inversions))
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
            shortcut("desc-halves", values, fixed, desc_halves),
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

fn insertion(a: &mut [i32], steps: &mut Vec<Step>) {
    for i in 1..a.len() {
        let val = a[i];
        for j in (1..=i).rev() {
            steps.push(Step::Compare {
                algorithm: Algorithm::Insertion,
            });
            if val >= a[j - 1] {
                break;
            }
            a.swap(j, j - 1);
            steps.push(Step::Swap {
                left: j - 1,
                right: j,
            });
        }
    }
}

fn merge_range(a: &mut [i32], scratch: &mut [i32], lo: usize, hi: usize, steps: &mut Vec<Step>) {
    if hi <= lo {
        return;
    }
    let mid = lo + (hi - lo) / 2;
    merge_range(a, scratch, lo, mid, steps);
    merge_range(a, scratch, mid + 1, hi, steps);
    let mut left = lo;
    let mut right = mid + 1;
    let mut out = lo;
    while left <= mid && right <= hi {
        steps.push(Step::Compare {
            algorithm: Algorithm::Merge,
        });
        if a[left] <= a[right] {
            scratch[out] = a[left];
            left += 1;
        } else {
            scratch[out] = a[right];
            right += 1;
        }
        out += 1;
    }
    let rest = if left <= mid {
        &a[left..=mid]
    } else {
        &a[right..=hi]
    };
    scratch[out..=hi].copy_from_slice(rest);
    a[lo..=hi].copy_from_slice(&scratch[lo..=hi]);
}
