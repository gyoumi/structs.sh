//! Types a template uses to describe its inputs to a puzzle search.

/// A named, hand-picked input worth trying before a wider search.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Shortcut<I> {
    /// A short kebab-case label, such as `"ascending"`.
    pub name: &'static str,
    /// The input itself.
    pub input: I,
}

/// Maps a valid partial input to a key shared by every valid partial input
/// that leaves the puzzle in the same state, or `None` when the partial input
/// is invalid.
pub type StateKeyFn<I> = Box<dyn Fn(&I) -> Option<Vec<u8>>>;

/// Lists valid one-step extensions of a partial input with each step's cost,
/// or an empty list when the partial input is invalid. May omit legal moves
/// when doing so preserves an optimum.
pub type ExtendFn<I> = Box<dyn Fn(&I) -> Vec<(I, u32)>>;

/// Every input a search may consider for one instance.
pub enum SearchSpace<I> {
    /// A finite list of complete inputs, produced lazily.
    Exhaustive(Box<dyn Iterator<Item = I>>),
    /// Inputs built step by step from `start`, for templates whose inputs
    /// have no fixed length.
    Incremental {
        /// The empty input every search begins from.
        start: I,
        /// Identifies the state a valid partial input reaches, or `None` if invalid.
        state_key: StateKeyFn<I>,
        /// Lists valid one-step extensions of a partial input and their costs.
        extend: ExtendFn<I>,
    },
}
