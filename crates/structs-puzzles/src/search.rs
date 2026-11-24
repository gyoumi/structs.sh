//! Types a template uses to describe its inputs to a puzzle search.

/// A named, hand-picked input worth trying before a wider search.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Shortcut<I> {
    /// A short kebab-case label, such as `"ascending"`.
    pub name: &'static str,
    /// The input itself.
    pub input: I,
}

/// Maps a partial input to a key shared by every partial input that leaves
/// the puzzle in the same state.
pub type StateKeyFn<I> = Box<dyn Fn(&I) -> Vec<u8>>;

/// Lists every one-step extension of a partial input, with that step's cost.
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
        /// Identifies the state a partial input reaches.
        state_key: StateKeyFn<I>,
        /// Lists a partial input's one-step extensions and their costs.
        extend: ExtendFn<I>,
    },
}
