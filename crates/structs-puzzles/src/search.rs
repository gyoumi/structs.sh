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
    /// Inputs built step by step from `start`, for
    /// [`ScoreDirection::LowerWins`](crate::ScoreDirection::LowerWins)
    /// templates whose inputs have no fixed length.
    ///
    /// Cumulative step costs from `start` must never exceed a solved
    /// descendant's [`Template::solved_score`](crate::Template::solved_score)
    /// (for additive-cost templates such as index drift, cumulative cost
    /// equals `solved_score`). States sharing a `state_key` must satisfy
    /// per-step dominance: whenever `a` and `b` share a key with cumulative
    /// costs `cost(a) <= cost(b)`, if `b` is solved then `a` is also solved
    /// with `solved_score(a) <= solved_score(b)`, and every one-step extension
    /// `(b', w_b)` of `b` is matched by a one-step extension `(a', w_a)` of
    /// `a` with the same key and `cost(a) + w_a <= cost(b) + w_b`.
    Incremental {
        /// The empty input every search begins from.
        start: I,
        /// Identifies the state a valid partial input reaches, or `None` if invalid.
        state_key: StateKeyFn<I>,
        /// Lists valid one-step extensions of a partial input and their costs.
        extend: ExtendFn<I>,
    },
}
