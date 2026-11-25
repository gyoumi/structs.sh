//! The keys a public challenge must never carry, in either spelling: they
//! hold the answer or how the challenge was generated. Shared by the
//! `daily-db` and `daily-server` tests through `common`, and by
//! `api/tests/bindings.rs` through `#[path]`.

/// Keys that must never appear in a public or served challenge.
pub const PRIVATE_KEYS: [&str; 13] = [
    "seed",
    "best",
    "bestScore",
    "best_score",
    "bestSolution",
    "best_solution",
    "botGoalRate",
    "botBestRate",
    "bot_goal_rate",
    "bot_best_rate",
    "templateVersion",
    "template_version",
    "rules",
];
