//! Postgres schema, migrations, and queries for the structs.sh daily game.
//!
//! Each day's puzzle is one row of `daily_puzzles`. [`insert_puzzle`] checks
//! a puzzle and gives it the next number; the `get_*` and `list_*` queries
//! read full [`DailyPuzzleRecord`]s, or [`PublicPuzzle`]s that leave out
//! the seed, best score, best solution, and bot rates.

mod db;
mod error;
mod instance;
mod model;
mod rows;

pub use db::{
    connect, get_public_puzzle_by_date, get_puzzle_by_date, insert_puzzle,
    list_public_puzzles_in_range, list_puzzles_in_range, migrate,
};
pub use error::DbError;
pub use model::{
    DailyPuzzleRecord, InsertOutcome, NewDailyPuzzle, PublicPuzzle, PuzzleInstance, PuzzleSolution,
};
pub use structs_puzzles::linked_list_index_drift::Operation;
