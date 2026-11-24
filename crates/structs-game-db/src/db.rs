//! Connecting, migrating, and querying the `daily_puzzles` table.

use crate::error::DbError;
use crate::model::{DailyPuzzleRecord, InsertOutcome, NewDailyPuzzle, PublicPuzzle};
use crate::rows::{PUBLIC_COLUMNS, RECORD_COLUMNS, public_from_row, record_from_row};
use chrono::NaiveDate;
use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;
use sqlx::types::Json;

/// Advisory lock key held while assigning a puzzle number, so concurrent
/// inserts get gap-free sequential numbers.
const NUMBER_LOCK: i64 = 7_382_915_401;

/// Opens a pool of up to 5 connections to `database_url`.
pub async fn connect(database_url: &str) -> Result<PgPool, DbError> {
    Ok(PgPoolOptions::new()
        .max_connections(5)
        .connect(database_url)
        .await?)
}

/// Applies any schema migrations not yet run.
pub async fn migrate(pool: &PgPool) -> Result<(), DbError> {
    sqlx::migrate!("./migrations").run(pool).await?;
    Ok(())
}

/// Converts a `u32` field to an `INTEGER` column value.
fn signed(field: &str, value: u32) -> Result<i32, DbError> {
    i32::try_from(value)
        .map_err(|_| DbError::InvalidData(format!("{field} {value} does not fit in an INTEGER")))
}

/// Checks a bot rate is a finite share in `0.0..=1.0`.
fn check_rate(field: &str, rate: f64) -> Result<(), DbError> {
    if rate.is_finite() && (0.0..=1.0).contains(&rate) {
        Ok(())
    } else {
        Err(DbError::InvalidData(format!(
            "{field} {rate} is not between 0 and 1"
        )))
    }
}

/// Checks every field of `puzzle` before anything touches the database.
fn validate(puzzle: &NewDailyPuzzle) -> Result<(), DbError> {
    if puzzle.template_version < 1 {
        return Err(DbError::InvalidData(
            "template_version must be at least 1".to_owned(),
        ));
    }
    signed("template_version", puzzle.template_version)?;
    signed("goal", puzzle.goal)?;
    signed("best_score", puzzle.best_score)?;
    check_rate("bot_goal_rate", puzzle.bot_goal_rate)?;
    check_rate("bot_best_rate", puzzle.bot_best_rate)?;
    match puzzle.instance.score_solution(&puzzle.best_solution)? {
        Some(score) if score == puzzle.best_score => Ok(()),
        Some(score) => Err(DbError::InvalidData(format!(
            "best_solution scores {score}, not best_score {}",
            puzzle.best_score
        ))),
        None => Err(DbError::InvalidData(
            "best_solution does not solve the puzzle".to_owned(),
        )),
    }
}

/// Schedules `puzzle` for its day with the next puzzle number.
///
/// Validates the puzzle first, including that `best_solution` solves it
/// with exactly `best_score`. When a puzzle already runs that day, returns
/// it unchanged as [`InsertOutcome::AlreadyScheduled`].
pub async fn insert_puzzle(
    pool: &PgPool,
    puzzle: &NewDailyPuzzle,
) -> Result<InsertOutcome, DbError> {
    validate(puzzle)?;
    let mut tx = pool.begin().await?;
    sqlx::query("SELECT pg_advisory_xact_lock($1)")
        .bind(NUMBER_LOCK)
        .execute(&mut *tx)
        .await?;
    let existing = sqlx::query(&format!(
        "SELECT {RECORD_COLUMNS} FROM daily_puzzles WHERE puzzle_date = $1"
    ))
    .bind(puzzle.puzzle_date)
    .fetch_optional(&mut *tx)
    .await?;
    if let Some(row) = existing {
        let record = record_from_row(&row)?;
        tx.commit().await?;
        return Ok(InsertOutcome::AlreadyScheduled(record));
    }
    let number: i32 = sqlx::query_scalar("SELECT COALESCE(MAX(number), 0) + 1 FROM daily_puzzles")
        .fetch_one(&mut *tx)
        .await?;
    let row = sqlx::query(&format!(
        "INSERT INTO daily_puzzles (puzzle_date, number, template, template_version, \
         instance, rules, seed, goal, best_score, best_solution, bot_goal_rate, bot_best_rate) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING {RECORD_COLUMNS}"
    ))
    .bind(puzzle.puzzle_date)
    .bind(number)
    .bind(puzzle.instance.template_id())
    .bind(signed("template_version", puzzle.template_version)?)
    .bind(Json(&puzzle.instance))
    .bind(&puzzle.rules)
    .bind(puzzle.seed as i64)
    .bind(signed("goal", puzzle.goal)?)
    .bind(signed("best_score", puzzle.best_score)?)
    .bind(Json(&puzzle.best_solution))
    .bind(puzzle.bot_goal_rate)
    .bind(puzzle.bot_best_rate)
    .fetch_one(&mut *tx)
    .await?;
    let record = record_from_row(&row)?;
    tx.commit().await?;
    Ok(InsertOutcome::Inserted(record))
}

/// The full record scheduled for `date`, if any.
pub async fn get_puzzle_by_date(
    pool: &PgPool,
    date: NaiveDate,
) -> Result<Option<DailyPuzzleRecord>, DbError> {
    sqlx::query(&format!(
        "SELECT {RECORD_COLUMNS} FROM daily_puzzles WHERE puzzle_date = $1"
    ))
    .bind(date)
    .fetch_optional(pool)
    .await?
    .as_ref()
    .map(record_from_row)
    .transpose()
}

/// The public view of the puzzle for `date`, if any; never reads private
/// columns.
pub async fn get_public_puzzle_by_date(
    pool: &PgPool,
    date: NaiveDate,
) -> Result<Option<PublicPuzzle>, DbError> {
    sqlx::query(&format!(
        "SELECT {PUBLIC_COLUMNS} FROM daily_puzzles WHERE puzzle_date = $1"
    ))
    .bind(date)
    .fetch_optional(pool)
    .await?
    .as_ref()
    .map(public_from_row)
    .transpose()
}

/// Full records from `start` to `end_inclusive`, oldest first.
pub async fn list_puzzles_in_range(
    pool: &PgPool,
    start: NaiveDate,
    end_inclusive: NaiveDate,
) -> Result<Vec<DailyPuzzleRecord>, DbError> {
    sqlx::query(&format!(
        "SELECT {RECORD_COLUMNS} FROM daily_puzzles \
         WHERE puzzle_date >= $1 AND puzzle_date <= $2 ORDER BY puzzle_date ASC"
    ))
    .bind(start)
    .bind(end_inclusive)
    .fetch_all(pool)
    .await?
    .iter()
    .map(record_from_row)
    .collect()
}

/// Public views from `start` to `end_inclusive`, oldest first; never reads
/// private columns.
pub async fn list_public_puzzles_in_range(
    pool: &PgPool,
    start: NaiveDate,
    end_inclusive: NaiveDate,
) -> Result<Vec<PublicPuzzle>, DbError> {
    sqlx::query(&format!(
        "SELECT {PUBLIC_COLUMNS} FROM daily_puzzles \
         WHERE puzzle_date >= $1 AND puzzle_date <= $2 ORDER BY puzzle_date ASC"
    ))
    .bind(start)
    .bind(end_inclusive)
    .fetch_all(pool)
    .await?
    .iter()
    .map(public_from_row)
    .collect()
}
