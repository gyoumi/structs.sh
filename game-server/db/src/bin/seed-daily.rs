//! Fills a daily game database with the fixed test challenges.
//!
//! Reads `DATABASE_URL`, runs the migrations, and schedules every challenge in
//! [`daily_db::seed::fixture_challenges`]. It then schedules a challenge
//! for today in Sydney, unless `SEED_ONLY_FIXTURES=1` is set or
//! `--only-fixtures` is passed. Running it again changes nothing.

use std::process::ExitCode;

use daily_db::seed::{seed_fixtures, seed_today_if_missing};
use daily_db::{DbError, InsertOutcome, connect, describe_db_error, migrate};

#[tokio::main]
async fn main() -> ExitCode {
    match run().await {
        Ok(summary) => {
            println!("{summary}");
            ExitCode::SUCCESS
        }
        Err(message) => {
            eprintln!("seed-daily: {message}");
            ExitCode::FAILURE
        }
    }
}

/// Seeds the database and describes what changed.
async fn run() -> Result<String, String> {
    let database_url = std::env::var("DATABASE_URL")
        .ok()
        .filter(|url| !url.trim().is_empty())
        .ok_or_else(|| "DATABASE_URL must be set to a Postgres connection URL".to_owned())?;
    let pool = connect(&database_url)
        .await
        .map_err(|err| failed("connecting to the database", &err))?;
    migrate(&pool)
        .await
        .map_err(|err| failed("running migrations", &err))?;
    let fixtures = seed_fixtures(&pool)
        .await
        .map_err(|err| failed("seeding the fixtures", &err))?;
    let mut summary = format!(
        "seeded fixtures: {} inserted, {} already scheduled",
        fixtures.inserted, fixtures.existing
    );
    if !only_fixtures() {
        match seed_today_if_missing(&pool, chrono::Utc::now())
            .await
            .map_err(|err| failed("seeding today's challenge", &err))?
        {
            Some(InsertOutcome::Inserted(record)) => {
                summary.push_str(&format!("; today ({}) inserted", record.challenge_date));
            }
            Some(InsertOutcome::AlreadyScheduled(record)) => {
                summary.push_str(&format!(
                    "; today ({}) already scheduled",
                    record.challenge_date
                ));
            }
            None => {
                summary.push_str("; today skipped (reserved unscheduled day)");
            }
        }
    }
    Ok(summary)
}

/// Whether to skip today's challenge, from the flag or `SEED_ONLY_FIXTURES`.
fn only_fixtures() -> bool {
    std::env::args().skip(1).any(|arg| arg == "--only-fixtures")
        || std::env::var("SEED_ONLY_FIXTURES").is_ok_and(|value| value.trim() == "1")
}

/// A message for a failed step that never quotes the database URL.
fn failed(step: &str, err: &DbError) -> String {
    match err {
        DbError::InvalidData(detail) => format!("{step} failed: {detail}"),
        _ => format!("{step} failed: {}", describe_db_error(err)),
    }
}
