//! Challenge templates, step logs, and scoring for the structs.sh daily game.
//!
//! Built for `wasm32-unknown-unknown`, the browser calls these exports (see
//! `ffi.rs`; the JSON they take and return is described in [`wire`]):
//! 1. `alloc(len)` for the request, which the caller copies in.
//! 2. `score(ptr, len)` to score a try, or `step_log(ptr, len)` to run an
//!    algorithm's step log. Each frees the request and returns 0 on success
//!    or 1 on failure.
//! 3. `result_ptr()` and `result_len()` to read the reply, or the error
//!    message, as UTF-8.
//! 4. `free_result()` once the caller has copied it.

pub mod avl_rotations;
pub mod bst_forced_order;
mod bst_space;
pub mod bubble;
mod fixed_slots;
pub mod hash_table;
pub mod heap;
pub mod insertion_beats_merge;
pub mod linked_list_index_drift;
mod list_space;
mod list_wire;
pub mod quicksort;
mod request;
mod rng;
mod search;
mod step_log_wire;
mod tree;
pub mod upset_bst_beats_avl;
mod validate;
pub mod wire;

#[cfg(target_arch = "wasm32")]
mod ffi;

pub use search::{ExtendFn, SearchSpace, Shortcut, StateKeyFn};

use std::cmp::Ordering;

/// Whether higher or lower solved scores rank better for a template.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScoreDirection {
    /// Higher solved scores rank ahead of lower ones.
    HigherWins,
    /// Lower solved scores rank ahead of higher ones.
    LowerWins,
}

impl ScoreDirection {
    /// Compares two outcomes (`Some(score)` for solved, `None` for unsolved),
    /// ordering the better outcome as [`Ordering::Greater`].
    ///
    /// Any solved attempt ranks ahead of an unsolved attempt, even when
    /// [`Self::LowerWins`] and the solved cost is positive.
    pub fn cmp_outcomes(self, a: Option<u32>, b: Option<u32>) -> Ordering {
        match (a, b) {
            (None, None) => Ordering::Equal,
            (None, Some(_)) => Ordering::Less,
            (Some(_), None) => Ordering::Greater,
            (Some(a), Some(b)) => match self {
                Self::HigherWins => a.cmp(&b),
                Self::LowerWins => b.cmp(&a),
            },
        }
    }
}

/// A daily game challenge template.
///
/// Each template fixes an algorithm, the input constraints, the step log it
/// emits when executed, and how that execution is scored.
pub trait Template {
    /// One specific challenge generated from this template.
    type Instance;
    /// A player's submitted input for an [`Instance`](Self::Instance).
    type Input;
    /// A single recorded event emitted by [`run`](Self::run).
    type Step;

    /// The id each challenge is tagged with.
    const ID: &'static str;

    /// Whether higher or lower solved scores rank better.
    const DIRECTION: ScoreDirection = ScoreDirection::HigherWins;

    /// Returns plain-text rules describing the challenge and its constraints.
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

    /// Validates `input` against `instance`, then returns the challenge score.
    ///
    /// Returns the same [`InputError`] as [`run`](Self::run) for invalid
    /// inputs.
    fn score(&self, instance: &Self::Instance, input: &Self::Input) -> Result<u32, InputError>;

    /// Validates `input` against `instance`, then returns `Some(score)` if
    /// the attempt solved the challenge, or `None` if it did not.
    ///
    /// Templates where every valid input is solved keep the default, which
    /// wraps [`score`](Self::score) in `Some`. Exact-target and disagree
    /// templates override this so solved zero-score attempts stay distinct
    /// from unsolved ones.
    fn solved_score(
        &self,
        instance: &Self::Instance,
        input: &Self::Input,
    ) -> Result<Option<u32>, InputError> {
        self.score(instance, input).map(Some)
    }

    /// Generates the challenge instance for `seed`; the same seed always gives
    /// the same instance.
    fn generate(&self, seed: u64) -> Self::Instance;

    /// Inputs a search may consider for `instance` (empty when `instance` is
    /// invalid or has no valid search candidates). Yielded inputs are valid,
    /// though not every one need satisfy the challenge's solve condition.
    fn search_space(&self, instance: &Self::Instance) -> SearchSpace<Self::Input>;

    /// Named, hand-picked valid inputs for `instance` (empty when `instance`
    /// is invalid or has no valid shortcut candidates). A shortcut need not
    /// satisfy the challenge's solve condition.
    fn shortcuts(&self, instance: &Self::Instance) -> Vec<Shortcut<Self::Input>>;

    /// A valid input for `instance`, determined by `seed`, or `None` when
    /// `instance` is invalid or has no valid inputs to sample. The returned
    /// input need not satisfy the challenge's solve condition.
    fn random_input(&self, instance: &Self::Instance, seed: u64) -> Option<Self::Input>;

    /// A valid input close to `input`, determined by `seed`, for local search,
    /// or `None` when `instance` or `input` is invalid. The returned input
    /// need not satisfy the challenge's solve condition.
    fn random_neighbor(
        &self,
        instance: &Self::Instance,
        input: &Self::Input,
        seed: u64,
    ) -> Option<Self::Input>;
}

/// Reason a player's input is rejected for a challenge instance.
///
/// Validation checks run in this exact order:
/// 1. Any fixed index is `>= instance.values.len()` ->
///    [`InputError::FixedSlotOutOfRange`].
/// 2. Input length differs from `instance.values.len()` ->
///    [`InputError::WrongLength`].
/// 3. Fixed indices checked in ascending order; the first index whose input
///    value differs from `instance.values[index]` ->
///    [`InputError::FixedValueMoved`].
/// 4. The input is not a rearrangement of `instance.values` ->
///    [`InputError::NotAPermutation`].
///
/// Both [`Template::run`] and [`Template::score`] return the same error for
/// the same invalid input.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum InputError {
    /// A fixed slot index in the instance is past the end of `values`.
    FixedSlotOutOfRange { index: usize },
    /// Input length did not match the instance's value count.
    WrongLength { expected: usize, got: usize },
    /// The lowest-indexed fixed slot whose value changed from the instance.
    FixedValueMoved { index: usize },
    /// Input has the right length and fixed values intact, but is not a
    /// rearrangement of the instance's values.
    NotAPermutation,
    /// Operation `operation` (0-based) deletes `index` from a list of
    /// `length` nodes, where `index >= length`.
    DeleteIndexOutOfRange {
        operation: usize,
        index: usize,
        length: usize,
    },
}
