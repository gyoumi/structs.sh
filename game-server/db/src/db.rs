//! Connecting, migrating, and querying the `daily_challenges` table.

use std::cmp::Ordering;

use crate::error::DbError;
use crate::model::{DailyChallengeRecord, InsertOutcome, NewDailyChallenge, PublicChallenge};
use crate::rows::{PUBLIC_COLUMNS, RECORD_COLUMNS, public_from_row, record_from_row};
use chrono::NaiveDate;
use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;
use sqlx::types::Json;

/// Advisory lock key held while assigning a challenge number, so concurrent
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

/// Checks every field of `challenge` before anything touches the database.
fn validate(challenge: &NewDailyChallenge) -> Result<(), DbError> {
    if challenge.template_version < 1 {
        return Err(DbError::InvalidData(
            "template_version must be at least 1".to_owned(),
        ));
    }
    if challenge.rules.trim().is_empty() {
        return Err(DbError::InvalidData("rules must not be blank".to_owned()));
    }
    challenge.instance.validate_shape()?;
    signed("template_version", challenge.template_version)?;
    signed("goal", challenge.goal)?;
    signed("best_score", challenge.best_score)?;
    check_rate("bot_goal_rate", challenge.bot_goal_rate)?;
    check_rate("bot_best_rate", challenge.bot_best_rate)?;
    if challenge
        .instance
        .score_direction()
        .cmp_outcomes(Some(challenge.best_score), Some(challenge.goal))
        == Ordering::Less
    {
        return Err(DbError::InvalidData(format!(
            "best_score {} does not reach goal {} for {}",
            challenge.best_score,
            challenge.goal,
            challenge.instance.template_id()
        )));
    }
    match challenge
        .instance
        .score_solution(&challenge.best_solution)?
    {
        Some(score) if score == challenge.best_score => Ok(()),
        Some(score) => Err(DbError::InvalidData(format!(
            "best_solution scores {score}, not best_score {}",
            challenge.best_score
        ))),
        None => Err(DbError::InvalidData(
            "best_solution does not solve the challenge".to_owned(),
        )),
    }
}

/// Schedules `challenge` for its day with the next challenge number.
///
/// Validates the challenge first, including that `best_solution` solves it
/// with exactly `best_score`. When a challenge already runs that day, returns
/// it unchanged as [`InsertOutcome::AlreadyScheduled`].
pub async fn insert_challenge(
    pool: &PgPool,
    challenge: &NewDailyChallenge,
) -> Result<InsertOutcome, DbError> {
    validate(challenge)?;
    let mut tx = pool.begin().await?;
    sqlx::query("SELECT pg_advisory_xact_lock($1)")
        .bind(NUMBER_LOCK)
        .execute(&mut *tx)
        .await?;
    let existing = sqlx::query(&format!(
        "SELECT {RECORD_COLUMNS} FROM daily_challenges WHERE challenge_date = $1"
    ))
    .bind(challenge.challenge_date)
    .fetch_optional(&mut *tx)
    .await?;
    if let Some(row) = existing {
        let record = record_from_row(&row)?;
        tx.commit().await?;
        return Ok(InsertOutcome::AlreadyScheduled(record));
    }
    let number: i32 =
        sqlx::query_scalar("SELECT COALESCE(MAX(number), 0) + 1 FROM daily_challenges")
            .fetch_one(&mut *tx)
            .await?;
    let row = sqlx::query(&format!(
        "INSERT INTO daily_challenges (challenge_date, number, template, template_version, \
         instance, rules, seed, goal, best_score, best_solution, bot_goal_rate, bot_best_rate) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING {RECORD_COLUMNS}"
    ))
    .bind(challenge.challenge_date)
    .bind(number)
    .bind(challenge.instance.template_id())
    .bind(signed("template_version", challenge.template_version)?)
    .bind(Json(&challenge.instance))
    .bind(&challenge.rules)
    .bind(challenge.seed as i64)
    .bind(signed("goal", challenge.goal)?)
    .bind(signed("best_score", challenge.best_score)?)
    .bind(Json(&challenge.best_solution))
    .bind(challenge.bot_goal_rate)
    .bind(challenge.bot_best_rate)
    .fetch_one(&mut *tx)
    .await?;
    let record = record_from_row(&row)?;
    tx.commit().await?;
    Ok(InsertOutcome::Inserted(record))
}

/// The full record scheduled for `date`, if any.
pub async fn get_challenge_by_date(
    pool: &PgPool,
    date: NaiveDate,
) -> Result<Option<DailyChallengeRecord>, DbError> {
    sqlx::query(&format!(
        "SELECT {RECORD_COLUMNS} FROM daily_challenges WHERE challenge_date = $1"
    ))
    .bind(date)
    .fetch_optional(pool)
    .await?
    .as_ref()
    .map(record_from_row)
    .transpose()
}

/// The public view of the challenge for `date`, if any; never reads private
/// columns.
pub async fn get_public_challenge_by_date(
    pool: &PgPool,
    date: NaiveDate,
) -> Result<Option<PublicChallenge>, DbError> {
    sqlx::query(&format!(
        "SELECT {PUBLIC_COLUMNS} FROM daily_challenges WHERE challenge_date = $1"
    ))
    .bind(date)
    .fetch_optional(pool)
    .await?
    .as_ref()
    .map(public_from_row)
    .transpose()
}

/// Full records from `start` to `end_inclusive`, oldest first.
pub async fn list_challenges_in_range(
    pool: &PgPool,
    start: NaiveDate,
    end_inclusive: NaiveDate,
) -> Result<Vec<DailyChallengeRecord>, DbError> {
    sqlx::query(&format!(
        "SELECT {RECORD_COLUMNS} FROM daily_challenges \
         WHERE challenge_date >= $1 AND challenge_date <= $2 ORDER BY challenge_date ASC"
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
pub async fn list_public_challenges_in_range(
    pool: &PgPool,
    start: NaiveDate,
    end_inclusive: NaiveDate,
) -> Result<Vec<PublicChallenge>, DbError> {
    sqlx::query(&format!(
        "SELECT {PUBLIC_COLUMNS} FROM daily_challenges \
         WHERE challenge_date >= $1 AND challenge_date <= $2 ORDER BY challenge_date ASC"
    ))
    .bind(start)
    .bind(end_inclusive)
    .fetch_all(pool)
    .await?
    .iter()
    .map(public_from_row)
    .collect()
}
