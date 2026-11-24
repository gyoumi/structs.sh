//! A fixed set of public puzzles for local stacks and end-to-end tests.
//!
//! [`fixture_puzzles`] schedules one puzzle for each launch template on fixed
//! dates. `2026-10-06` is left empty on purpose, so tests can see the "no
//! puzzle today" state. Every fixture's best solution was checked with
//! `structs_puzzles`, and [`insert_puzzle`] checks it again on every insert.

use chrono::NaiveDate;
use chrono_tz::Australia::Sydney;
use sqlx::PgPool;
use structs_puzzles::linked_list_index_drift::Operation;

use crate::db::insert_puzzle;
use crate::error::DbError;
use crate::model::{InsertOutcome, NewDailyPuzzle, PuzzleInstance, PuzzleSolution};

/// The day no fixture runs, kept empty for the "no puzzle today" tests.
const UNSCHEDULED_DAY: (i32, u32, u32) = (2026, 10, 6);

/// What [`seed_fixtures`] did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SeedSummary {
    /// Fixtures stored by this run.
    pub inserted: usize,
    /// Fixtures whose day already had a puzzle, left unchanged.
    pub existing: usize,
}

/// The calendar date `year-month-day`, which must exist.
fn day(year: i32, month: u32, day: u32) -> NaiveDate {
    NaiveDate::from_ymd_opt(year, month, day).unwrap_or(NaiveDate::MIN)
}

/// A fixture for `date` with the template's own rules text.
fn fixture(
    date: NaiveDate,
    seed: u64,
    instance: PuzzleInstance,
    par: u32,
    best_score: u32,
    best_solution: PuzzleSolution,
) -> NewDailyPuzzle {
    NewDailyPuzzle {
        puzzle_date: date,
        template_version: 1,
        rules: instance.rules(),
        instance,
        seed,
        goal: par,
        best_score,
        best_solution,
        bot_goal_rate: 0.25,
        bot_best_rate: 0.05,
    }
}

/// The quicksort puzzle the fixtures run on `2026-10-03`, moved to `date`.
fn quicksort_fixture(date: NaiveDate) -> NewDailyPuzzle {
    fixture(
        date,
        3,
        PuzzleInstance::Quicksort {
            values: vec![8, 1, 6, 3, 2, 7, 4, 5],
            fixed: vec![1, 4, 6],
        },
        34,
        36,
        PuzzleSolution::Arrangement(vec![8, 1, 6, 3, 2, 5, 4, 7]),
    )
}

/// One valid puzzle per launch template, in date order, with no puzzle on
/// `2026-10-06`.
pub fn fixture_puzzles() -> Vec<NewDailyPuzzle> {
    vec![
        fixture(
            day(2026, 4, 4),
            1,
            PuzzleInstance::InsertionBeatsMerge {
                values: vec![3, 5, 4, 1, 7, 9, 2, 8, 6],
                fixed: vec![3, 7, 8],
            },
            13,
            14,
            PuzzleSolution::Arrangement(vec![4, 2, 9, 1, 5, 7, 3, 8, 6]),
        ),
        fixture(
            day(2026, 4, 5),
            1,
            PuzzleInstance::UpsetBstBeatsAvl {
                values: vec![3, 5, 12, 14, 11, 1, 4, 9, 6, 2, 8, 13, 7, 10],
                fixed: vec![3, 4, 5, 10, 12, 13],
            },
            3,
            5,
            PuzzleSolution::Arrangement(vec![9, 3, 2, 14, 11, 1, 5, 4, 6, 12, 8, 13, 7, 10]),
        ),
        fixture(
            day(2026, 4, 6),
            1,
            PuzzleInstance::LinkedListIndexDrift {
                start: vec![6, 7, 5, 4, 1, 2],
                target: vec![7, 5, 6, 4, 1, 2],
            },
            7,
            5,
            PuzzleSolution::Operations(vec![
                Operation::Delete { index: 0 },
                Operation::Insert { value: 6, index: 2 },
            ]),
        ),
        quicksort_fixture(day(2026, 10, 3)),
        fixture(
            day(2026, 10, 4),
            1,
            PuzzleInstance::Bubble {
                values: vec![1, 6, 3, 8, 4, 5, 2, 7],
                fixed: vec![0, 4, 7],
                target_passes: 6,
            },
            15,
            16,
            PuzzleSolution::Arrangement(vec![1, 8, 6, 5, 4, 3, 2, 7]),
        ),
        fixture(
            day(2026, 10, 5),
            1,
            PuzzleInstance::AvlRotations {
                values: vec![3, 5, 4, 1, 7, 9, 2, 8, 6],
                fixed: vec![3, 7, 8],
            },
            8,
            10,
            PuzzleSolution::Arrangement(vec![3, 7, 5, 1, 2, 4, 9, 8, 6]),
        ),
        fixture(
            day(2026, 10, 7),
            1,
            PuzzleInstance::BstForcedOrder {
                values: vec![5, 3, 9, 2, 10, 4, 1, 7, 8, 6],
                target_tree: vec![9, 4, 2, 1, 3, 7, 6, 5, 8, 10],
            },
            4,
            5,
            PuzzleSolution::Arrangement(vec![9, 4, 2, 7, 1, 3, 6, 8, 10, 5]),
        ),
    ]
}

/// Schedules every [`fixture_puzzles`] puzzle whose day is still free.
///
/// Running it again changes nothing: days that already have a puzzle are
/// counted as [`SeedSummary::existing`].
pub async fn seed_fixtures(pool: &PgPool) -> Result<SeedSummary, DbError> {
    let mut summary = SeedSummary {
        inserted: 0,
        existing: 0,
    };
    for puzzle in fixture_puzzles() {
        match insert_puzzle(pool, &puzzle).await? {
            InsertOutcome::Inserted(_) => summary.inserted += 1,
            InsertOutcome::AlreadyScheduled(_) => summary.existing += 1,
        }
    }
    Ok(summary)
}

/// Schedules the fixtures' quicksort puzzle for the Sydney date of `now`,
/// unless a puzzle already runs that day.
///
/// Returns `Ok(None)` when that date is `2026-10-06`, which stays empty for
/// tests.
pub async fn seed_today_if_missing(
    pool: &PgPool,
    now: chrono::DateTime<chrono::Utc>,
) -> Result<Option<InsertOutcome>, DbError> {
    let today = now.with_timezone(&Sydney).date_naive();
    let (year, month, dom) = UNSCHEDULED_DAY;
    if today == day(year, month, dom) {
        return Ok(None);
    }
    insert_puzzle(pool, &quicksort_fixture(today))
        .await
        .map(Some)
}
