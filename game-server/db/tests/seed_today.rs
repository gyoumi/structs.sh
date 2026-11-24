//! Scheduling today's puzzle with `daily_db::seed::seed_today_if_missing`:
//! the puzzle day is the calendar date of `now` in Australia/Sydney, and
//! 2026-10-06 is left unscheduled on purpose.
//!
//! The tests run only when `DATABASE_URL` is set, each in its own disposable
//! schema (as in `seed_fixtures.rs` and `postgres_roundtrip.rs`).

use std::sync::atomic::{AtomicU64, Ordering};

use chrono::{DateTime, NaiveDate, Utc};
use daily_db::seed::{fixture_challenges, seed_today_if_missing};
use daily_db::{
    DailyChallengeRecord, InsertOutcome, NewDailyChallenge, get_challenge_by_date,
    get_public_challenge_by_date, insert_challenge, list_challenges_in_range, migrate,
};
use sqlx::postgres::PgPoolOptions;
use sqlx::{Executor, PgPool};

/// The day left unscheduled so the e2e suite sees a real 404.
const GAP: &str = "2026-10-06";

fn day(text: &str) -> NaiveDate {
    text.parse()
        .unwrap_or_else(|e| panic!("test date {text:?} is not YYYY-MM-DD: {e}"))
}

static NEXT_SCHEMA: AtomicU64 = AtomicU64::new(1);

/// Runs `body` against a migrated disposable schema, dropping it even when
/// `body` panics; does nothing when `DATABASE_URL` is unset.
async fn with_test_db<F, Fut>(test: &str, body: F)
where
    F: FnOnce(PgPool) -> Fut + Send + 'static,
    Fut: std::future::Future<Output = ()> + Send + 'static,
{
    let Ok(url) = std::env::var("DATABASE_URL") else {
        eprintln!("{test}: DATABASE_URL is not set, skipping the Postgres test");
        return;
    };
    let seq = NEXT_SCHEMA.fetch_add(1, Ordering::Relaxed);
    let schema = format!(
        "daily_challenges_seed_today_test_{}_{seq}",
        std::process::id()
    );
    let admin = daily_db::connect(&url)
        .await
        .expect("connect to DATABASE_URL");
    let drop_sql = format!("DROP SCHEMA IF EXISTS \"{schema}\" CASCADE");
    sqlx::query(&format!("CREATE SCHEMA \"{schema}\""))
        .execute(&admin)
        .await
        .expect("create disposable test schema");
    let search_path = format!("SET search_path TO \"{schema}\"");
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .after_connect(move |conn, _meta| {
            let sql = search_path.clone();
            Box::pin(async move {
                conn.execute(sql.as_str()).await?;
                Ok(())
            })
        })
        .connect(&url)
        .await;
    let result = match pool {
        Ok(pool) => {
            let inner = pool.clone();
            let result = tokio::spawn(async move {
                migrate(&inner)
                    .await
                    .expect("migrate the disposable test schema");
                body(inner).await;
            })
            .await;
            pool.close().await;
            result
        }
        Err(err) => {
            sqlx::query(&drop_sql).execute(&admin).await.ok();
            panic!("connect pool to disposable test schema: {err}");
        }
    };
    sqlx::query(&drop_sql)
        .execute(&admin)
        .await
        .expect("drop disposable test schema");
    admin.close().await;
    if let Err(err) = result {
        std::panic::resume_unwind(err.into_panic());
    }
}

// ---------------------------------------------------------------------------
// seed_today_if_missing(pool, now): the puzzle day is `now`'s calendar date in
// Australia/Sydney (AEDT = UTC+11 from 2026-10-04, AEST = UTC+10 before).
// ---------------------------------------------------------------------------

/// The instant `text`, an RFC 3339 UTC timestamp such as `2026-12-01T13:30:00Z`.
fn instant(text: &str) -> DateTime<Utc> {
    text.parse()
        .unwrap_or_else(|e| panic!("test instant {text:?} is not RFC 3339: {e}"))
}

/// The fixtures' quicksort puzzle (the one on 2026-10-03), moved to `date`.
fn quicksort_on(date: NaiveDate) -> NewDailyChallenge {
    let mut puzzle = fixture_challenges()
        .into_iter()
        .find(|p| p.challenge_date == day("2026-10-03"))
        .unwrap_or_else(|| panic!("fixture_challenges(): nothing scheduled on 2026-10-03"));
    puzzle.challenge_date = date;
    puzzle
}

/// A puzzle for `date` that is not the quicksort fixture: the bubble fixture
/// from 2026-10-04, moved.
fn bubble_on(date: NaiveDate) -> NewDailyChallenge {
    let mut puzzle = fixture_challenges()
        .into_iter()
        .find(|p| p.challenge_date == day("2026-10-04"))
        .unwrap_or_else(|| panic!("fixture_challenges(): nothing scheduled on 2026-10-04"));
    puzzle.challenge_date = date;
    puzzle
}

/// The record the store should hold for `puzzle` once numbered `number`.
fn record_of(puzzle: &NewDailyChallenge, number: u32) -> DailyChallengeRecord {
    DailyChallengeRecord {
        challenge_date: puzzle.challenge_date,
        number,
        template_version: puzzle.template_version,
        instance: puzzle.instance.clone(),
        rules: puzzle.rules.clone(),
        seed: puzzle.seed,
        goal: puzzle.goal,
        best_score: puzzle.best_score,
        best_solution: puzzle.best_solution.clone(),
        bot_goal_rate: puzzle.bot_goal_rate,
        bot_best_rate: puzzle.bot_best_rate,
    }
}

/// A one-line description of an outcome, for assertion messages.
fn outcome_text(outcome: &Option<InsertOutcome>) -> String {
    match outcome {
        None => "None".to_owned(),
        Some(InsertOutcome::Inserted(r)) => format!(
            "Some(Inserted(date {}, number {}, template {}))",
            r.challenge_date,
            r.number,
            r.instance.template_id()
        ),
        Some(InsertOutcome::AlreadyScheduled(r)) => format!(
            "Some(AlreadyScheduled(date {}, number {}, template {}))",
            r.challenge_date,
            r.number,
            r.instance.template_id()
        ),
    }
}

/// Calls `seed_today_if_missing(pool, now)`, panicking with the instant on error.
async fn seed_today_at(pool: &PgPool, now: &str) -> Option<InsertOutcome> {
    seed_today_if_missing(pool, instant(now))
        .await
        .unwrap_or_else(|e| panic!("seed_today_if_missing(now = {now}) failed: {e:?}"))
}

/// Every stored puzzle in 2026, as `(date, template)`.
async fn stored_2026(pool: &PgPool, call: &str) -> Vec<(String, &'static str)> {
    list_challenges_in_range(pool, day("2026-01-01"), day("2026-12-31"))
        .await
        .unwrap_or_else(|e| panic!("{call}: list_challenges_in_range(2026) failed: {e:?}"))
        .iter()
        .map(|r| (r.challenge_date.to_string(), r.instance.template_id()))
        .collect()
}

/// Checks that `now` (UTC) is scheduled on Sydney date `want`, on an empty
/// schema: the outcome is `Inserted` for `want`, and only `want` holds a puzzle.
async fn assert_seeds_sydney_date(pool: &PgPool, now: &str, sydney: &str, want: &str) {
    let call = format!("seed_today_if_missing(now = {now}, Sydney {sydney}) on an empty schema");
    let outcome = seed_today_at(pool, now).await;
    let inserted_date = match &outcome {
        Some(InsertOutcome::Inserted(r)) => Some(r.challenge_date.to_string()),
        _ => None,
    };
    assert_eq!(
        inserted_date.as_deref(),
        Some(want),
        "{call}: expected Some(Inserted(..)) for puzzle date {want} (the Sydney calendar date, \
         not the UTC one), got {}",
        outcome_text(&outcome)
    );
    let stored = stored_2026(pool, &call).await;
    assert_eq!(
        stored,
        vec![(want.to_owned(), "quicksort-most-comparisons")],
        "{call}: expected exactly one stored puzzle, the quicksort fixture on {want}, got {stored:?}"
    );
}

#[tokio::test]
async fn seed_today_uses_the_sydney_date_just_after_midnight_in_summer() {
    with_test_db(
        "seed_today_uses_the_sydney_date_just_after_midnight_in_summer",
        |pool| async move {
            // 13:30 UTC on 1 Dec is 00:30 AEDT (UTC+11) on 2 Dec in Sydney.
            assert_seeds_sydney_date(
                &pool,
                "2026-12-01T13:30:00Z",
                "2026-12-02 00:30 AEDT",
                "2026-12-02",
            )
            .await;
        },
    )
    .await;
}

#[tokio::test]
async fn seed_today_uses_the_sydney_date_just_before_midnight_in_summer() {
    with_test_db(
        "seed_today_uses_the_sydney_date_just_before_midnight_in_summer",
        |pool| async move {
            // 12:59:59 UTC on 1 Dec is 23:59:59 AEDT (UTC+11) on 1 Dec in Sydney.
            assert_seeds_sydney_date(
                &pool,
                "2026-12-01T12:59:59Z",
                "2026-12-01 23:59:59 AEDT",
                "2026-12-01",
            )
            .await;
        },
    )
    .await;
}

#[tokio::test]
async fn seed_today_uses_standard_time_offset_in_winter() {
    with_test_db(
        "seed_today_uses_standard_time_offset_in_winter",
        |pool| async move {
            // AEST is UTC+10: 13:30 UTC on 30 Jun is 23:30 on 30 Jun in Sydney
            // (with the summer offset of +11 it would wrongly be 1 Jul).
            assert_seeds_sydney_date(
                &pool,
                "2026-06-30T13:30:00Z",
                "2026-06-30 23:30 AEST",
                "2026-06-30",
            )
            .await;
        },
    )
    .await;
    with_test_db(
        "seed_today_uses_standard_time_offset_in_winter (after midnight)",
        |pool| async move {
            // 14:30 UTC on 30 Jun is 00:30 AEST on 1 Jul in Sydney.
            assert_seeds_sydney_date(
                &pool,
                "2026-06-30T14:30:00Z",
                "2026-07-01 00:30 AEST",
                "2026-07-01",
            )
            .await;
        },
    )
    .await;
}

#[tokio::test]
async fn seed_today_inserts_the_quicksort_fixture_on_a_missing_day() {
    with_test_db(
        "seed_today_inserts_the_quicksort_fixture_on_a_missing_day",
        |pool| async move {
            let now = "2026-11-15T02:00:00Z";
            let date = day("2026-11-15");
            let call = format!("seed_today_if_missing(now = {now}, Sydney 2026-11-15 13:00 AEDT) on an empty schema");
            let want = quicksort_on(date);
            let outcome = seed_today_at(&pool, now).await;
            let Some(InsertOutcome::Inserted(returned)) = &outcome else {
                panic!(
                    "{call}: expected Some(Inserted(..)) for 2026-11-15, got {}",
                    outcome_text(&outcome)
                );
            };
            assert_eq!(
                *returned,
                record_of(&want, returned.number),
                "{call}: the returned record should be the fixtures' quicksort puzzle \
                 (the 2026-10-03 one) dated 2026-11-15; expected left, got right"
            );
            assert_eq!(
                returned.number, 1,
                "{call}: the first puzzle in an empty schema should be number 1, got {}",
                returned.number
            );
            let stored = get_challenge_by_date(&pool, date)
                .await
                .unwrap_or_else(|e| panic!("{call}: get_challenge_by_date(2026-11-15) failed: {e:?}"));
            assert_eq!(
                stored.as_ref(),
                Some(returned),
                "{call}: get_challenge_by_date(2026-11-15) should return the same record the \
                 call returned; expected left, got right"
            );
            let public = get_public_challenge_by_date(&pool, date)
                .await
                .unwrap_or_else(|e| {
                    panic!("{call}: get_public_challenge_by_date(2026-11-15) failed: {e:?}")
                });
            assert!(
                matches!(&public, Some(p) if p.date == date && p.instance == want.instance && p.goal == want.goal),
                "{call}: get_public_challenge_by_date(2026-11-15) should show date 2026-11-15, \
                 instance {:?}, goal {}; got {public:?}",
                want.instance,
                want.goal
            );
        },
    )
    .await;
}

#[tokio::test]
async fn seed_today_leaves_an_existing_puzzle_unchanged() {
    with_test_db(
        "seed_today_leaves_an_existing_puzzle_unchanged",
        |pool| async move {
            let now = "2026-11-20T05:00:00Z";
            let date = day("2026-11-20");
            let call = format!(
                "seed_today_if_missing(now = {now}, Sydney 2026-11-20 16:00 AEDT) when \
                 2026-11-20 already has the bubble fixture"
            );
            let existing = match insert_challenge(&pool, &bubble_on(date)).await {
                Ok(InsertOutcome::Inserted(record)) => record,
                other => panic!(
                    "setup: insert_challenge(bubble on 2026-11-20) should insert, got {other:?}"
                ),
            };
            let outcome = seed_today_at(&pool, now).await;
            match &outcome {
                Some(InsertOutcome::AlreadyScheduled(record)) => assert_eq!(
                    *record, existing,
                    "{call}: AlreadyScheduled should carry the stored bubble puzzle unchanged; \
                     expected left, got right"
                ),
                _ => panic!(
                    "{call}: expected Some(AlreadyScheduled(date 2026-11-20, number {}, template \
                     bubble-exact-passes)), got {}",
                    existing.number,
                    outcome_text(&outcome)
                ),
            }
            let stored = get_challenge_by_date(&pool, date)
                .await
                .unwrap_or_else(|e| {
                    panic!("{call}: get_challenge_by_date(2026-11-20) failed: {e:?}")
                });
            assert_eq!(
                stored.as_ref(),
                Some(&existing),
                "{call}: the stored puzzle for 2026-11-20 must stay the bubble puzzle; \
                 expected left, got right"
            );
            let all = stored_2026(&pool, &call).await;
            assert_eq!(
                all,
                vec![("2026-11-20".to_owned(), "bubble-exact-passes")],
                "{call}: no other puzzle should be stored, got {all:?}"
            );
        },
    )
    .await;
}

#[tokio::test]
async fn seed_today_leaves_the_reserved_day_empty() {
    with_test_db(
        "seed_today_leaves_the_reserved_day_empty",
        |pool| async move {
            // 13:30 UTC on 5 Oct is 00:30 AEDT on 6 Oct in Sydney: the reserved day,
            // even though the UTC date is still 5 Oct.
            for now in ["2026-10-05T13:30:00Z", "2026-10-06T12:59:59Z"] {
                let call = format!(
                    "seed_today_if_missing(now = {now}, Sydney date {GAP}, the reserved day)"
                );
                let outcome = seed_today_at(&pool, now).await;
                assert!(
                    outcome.is_none(),
                    "{call}: expected Ok(None) and nothing inserted, got {}",
                    outcome_text(&outcome)
                );
                let gap = get_challenge_by_date(&pool, day(GAP))
                    .await
                    .unwrap_or_else(|e| {
                        panic!("{call}: get_challenge_by_date({GAP}) failed: {e:?}")
                    });
                assert!(
                    gap.is_none(),
                    "{call}: {GAP} must stay without a puzzle, got {gap:?}"
                );
                let all = stored_2026(&pool, &call).await;
                assert!(
                    all.is_empty(),
                    "{call}: nothing should be stored on any date, got {all:?}"
                );
            }
        },
    )
    .await;
}

#[tokio::test]
async fn seed_today_schedules_the_day_after_the_reserved_day() {
    with_test_db(
        "seed_today_schedules_the_day_after_the_reserved_day",
        |pool| async move {
            // 13:30 UTC on 6 Oct is 00:30 AEDT on 7 Oct in Sydney: the UTC date
            // is the reserved day, but the Sydney date is not.
            assert_seeds_sydney_date(
                &pool,
                "2026-10-06T13:30:00Z",
                "2026-10-07 00:30 AEDT",
                "2026-10-07",
            )
            .await;
        },
    )
    .await;
}
