//! Reading `daily_challenges` rows back into model types.

use crate::error::DbError;
use crate::model::{ChallengeInstance, ChallengeSolution, DailyChallengeRecord, PublicChallenge};
use chrono::NaiveDate;
use sqlx::Row;
use sqlx::postgres::PgRow;
use sqlx::types::Json;

/// The columns a [`DailyChallengeRecord`] is read from.
pub(crate) const RECORD_COLUMNS: &str = "challenge_date, number, template, template_version, \
     instance, rules, seed, goal, best_score, best_solution, bot_goal_rate, bot_best_rate";

/// The columns a [`PublicChallenge`] is read from; none of them are private.
pub(crate) const PUBLIC_COLUMNS: &str = "challenge_date, number, instance, goal";

/// Converts a non-negative `INTEGER` column to `u32`.
fn unsigned(row: &PgRow, column: &str) -> Result<u32, DbError> {
    let value: i32 = row.try_get(column)?;
    u32::try_from(value)
        .map_err(|_| DbError::InvalidData(format!("column {column} holds negative value {value}")))
}

/// Reads a full record, checking its `template` column matches its instance.
pub(crate) fn record_from_row(row: &PgRow) -> Result<DailyChallengeRecord, DbError> {
    let template: String = row.try_get("template")?;
    let Json(instance): Json<ChallengeInstance> = row.try_get("instance")?;
    if template != instance.template_id() {
        return Err(DbError::InvalidData(format!(
            "row template {template} does not match its {} instance",
            instance.template_id()
        )));
    }
    let Json(best_solution): Json<ChallengeSolution> = row.try_get("best_solution")?;
    let seed: i64 = row.try_get("seed")?;
    Ok(DailyChallengeRecord {
        challenge_date: row.try_get::<NaiveDate, _>("challenge_date")?,
        number: unsigned(row, "number")?,
        template_version: unsigned(row, "template_version")?,
        instance,
        rules: row.try_get("rules")?,
        seed: seed as u64,
        goal: unsigned(row, "goal")?,
        best_score: unsigned(row, "best_score")?,
        best_solution,
        bot_goal_rate: row.try_get("bot_goal_rate")?,
        bot_best_rate: row.try_get("bot_best_rate")?,
    })
}

/// Reads the public fields of a puzzle.
pub(crate) fn public_from_row(row: &PgRow) -> Result<PublicChallenge, DbError> {
    let Json(instance): Json<ChallengeInstance> = row.try_get("instance")?;
    Ok(PublicChallenge {
        number: unsigned(row, "number")?,
        instance,
        goal: unsigned(row, "goal")?,
        date: row.try_get("challenge_date")?,
    })
}
