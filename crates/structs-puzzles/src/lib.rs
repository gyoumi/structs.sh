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

pub mod avl_rotations;
pub mod bst_forced_order;
pub mod bubble;
pub mod insertion_beats_merge;
pub mod linked_list_index_drift;
mod list_wire;
pub mod quicksort;
mod request;
mod tree;
pub mod upset_bst_beats_avl;
mod validate;
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
