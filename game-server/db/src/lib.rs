//! Postgres schema, migrations, and queries for the structs.sh daily game.
//!
//! Each day's challenge is one row of `daily_challenges`. [`insert_challenge`] checks
//! a challenge and gives it the next number; the `get_*` and `list_*` queries
//! read full [`DailyChallengeRecord`]s, or [`PublicChallenge`]s that leave out
//! the seed, best score, best solution, and bot rates.

mod date;
mod db;
mod error;
mod instance;
mod model;
mod rows;
mod sanitize;
pub mod seed;

pub use daily_challenges::linked_list_index_drift::Operation;
pub use date::sydney_date;
pub use db::{
    connect, get_challenge_by_date, get_public_challenge_by_date, insert_challenge,
    list_challenges_in_range, list_public_challenges_in_range, migrate,
};
pub use error::DbError;
pub use model::{
    ChallengeInstance, ChallengeSolution, DailyChallengeRecord, InsertOutcome, NewDailyChallenge,
    PublicChallenge,
};
pub use sanitize::describe_db_error;
