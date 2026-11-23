//! Puzzle templates, step logs, and scoring for the structs.sh daily game.
//!
//! Built for `wasm32-unknown-unknown`, the browser calls these exports (see
//! `ffi.rs`; the JSON they take and return is described in [`wire`]):
//! 1. `alloc(len)` for the request, which the caller copies in.
//! 2. `score(ptr, len)`, which frees the request and returns 0 on success or
//!    1 on failure.
//! 3. `result_ptr()` and `result_len()` to read the reply, or the error
//!    message, as UTF-8.
//! 4. `free_result()` once the caller has copied it.

pub mod wire;

#[cfg(target_arch = "wasm32")]
mod ffi;

/// A daily game puzzle template.
///
/// Each template fixes an algorithm, the input constraints, the step log it
/// emits when executed, and how that execution is scored.
pub trait Template {
    /// One specific puzzle generated from this template.
    type Instance;
    /// A player's submitted input for an [`Instance`](Self::Instance).
    type Input;
    /// A single recorded event emitted by [`run`](Self::run).
    type Step;

    /// The id puzzle files use.
    const ID: &'static str;

    /// Returns plain-text rules describing the puzzle and its constraints.
    fn rules(&self, instance: &Self::Instance) -> String;

    /// Validates `input` against `instance`, then runs the algorithm and
    /// returns the full step log.
    ///
    /// Returns the same [`InputError`] as [`score`](Self::score) for invalid
    /// inputs.
    fn run(
        &self,
        instance: &Self::Instance,
        input: &Self::Input,
    ) -> Result<Vec<Self::Step>, InputError>;

    /// Validates `input` against `instance`, then returns the puzzle score.
    ///
    /// Returns the same [`InputError`] as [`run`](Self::run) for invalid
    /// inputs.
    fn score(&self, instance: &Self::Instance, input: &Self::Input) -> Result<u32, InputError>;
}

/// Reason a player's input is rejected for a puzzle instance.
///
/// Validation checks run in this exact order:
/// 1. Input length differs from `instance.values.len()` ->
///    [`InputError::WrongLength`].
/// 2. Fixed indices checked in ascending order; the first index whose input
///    value differs from `instance.values[index]` ->
///    [`InputError::FixedValueMoved`].
/// 3. The input is not a rearrangement of `instance.values` ->
///    [`InputError::NotAPermutation`].
///
/// Both [`Template::run`] and [`Template::score`] return the same error for
/// the same invalid input.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum InputError {
    /// Input length did not match the instance's value count.
    WrongLength { expected: usize, got: usize },
    /// The lowest-indexed fixed slot whose value changed from the instance.
    FixedValueMoved { index: usize },
    /// Input has the right length and fixed values intact, but is not a
    /// rearrangement of the instance's values.
    NotAPermutation,
}

/// "Quicksort: the most comparisons" puzzle template.
///
/// # Algorithm
///
/// [`Quicksort::run`](crate::Template::run) executes `quicksort(a, 0, n - 1)`
/// matching `quickCodeSnippet` in
/// `client/src/visualiser-src/sorting-visualiser/util/codeSnippets.ts`:
///
/// - If `hi <= lo`, return immediately. Arrays of length 0 and 1 emit no steps
///   and score `0`.
/// - `partition(a, lo, hi)`:
///   - `v = a[lo]` (the pivot), `i = lo + 1`, `j = hi`.
///   - Loop forever:
///     - `while (a[i] <= v && i < j) i++;`
///     - `while (v < a[j] && j > i) j--;`
///     - `if (i == j) break;`
///     - `swap(a, i, j);`
///   - `j = a[i] < v ? i : i - 1;`
///   - `swap(a, lo, j);`
///   - Return `j`.
/// - Recurse left `quicksort(a, lo, j - 1)`, then right
///   `quicksort(a, j + 1, hi)`.
///
/// # Step log and score
///
/// - [`Step::Compare`] is logged for every evaluation of `a[i] <= v` and
///   `v < a[j]`, including the evaluation that ends each `while` loop (the
///   value comparison is on the left-hand side of `&&`, so it always runs),
///   plus one for `a[i] < v` after each partition loop. `index` is the slot
///   compared with `v`, and `pivot` is `v`. Index checks (`i < j`, `j > i`,
///   `i == j`, `hi <= lo`) are not logged.
/// - [`Step::Swap`] is logged for every `swap` call (both inside the partition
///   loop and the final `swap(a, lo, j)`), including when `i == j`.
/// - [`Quicksort::score`](crate::Template::score) is the number of
///   [`Step::Compare`] entries in `run`'s step log.
/// - Applying every [`Step::Swap`] in order to the input sorts it ascending.
///
/// # Validation
///
/// Inputs are validated in [`InputError`] order:
/// 1. [`InputError::WrongLength`] if `input.len() != instance.values.len()`.
/// 2. [`InputError::FixedValueMoved`] for the smallest index in
///    `instance.fixed` where `input[index] != instance.values[index]`.
/// 3. [`InputError::NotAPermutation`] if `input` is not a rearrangement of
///    `instance.values`.
///
/// Instances are assumed to have distinct values and valid fixed indices.
///
/// # Rules text
///
/// [`Quicksort::rules`](crate::Template::rules) returns plain text containing
/// these two exact sentences:
/// - `Arrange the free values so quicksort makes as many comparisons as possible.`
/// - `Fixed values stay where they are.`
pub mod quicksort {
    use crate::{InputError, Template};

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
            validate(instance, input)?;
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
    }

    fn validate(instance: &Instance, input: &[i32]) -> Result<(), InputError> {
        let expected = instance.values.len();
        if input.len() != expected {
            return Err(InputError::WrongLength {
                expected,
                got: input.len(),
            });
        }
        if let Some(index) = instance
            .fixed
            .iter()
            .copied()
            .filter(|&index| input[index] != instance.values[index])
            .min()
        {
            return Err(InputError::FixedValueMoved { index });
        }
        let mut got = input.to_vec();
        let mut want = instance.values.clone();
        got.sort_unstable();
        want.sort_unstable();
        if got != want {
            return Err(InputError::NotAPermutation);
        }
        Ok(())
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
}
