//! The deterministic dev/CI seeder `structs_game_db::seed`: one fixture per
//! launch template on fixed dates around Sydney's 2026 daylight saving
//! changes, with 2026-10-06 left unscheduled on purpose.
//!
//! `fixture_puzzles` is checked without a database. The `seed_fixtures` and
//! `seed_today_if_missing` tests run only when `DATABASE_URL` is set, each in
//! its own disposable schema (as in `postgres_roundtrip.rs`).

use std::collections::BTreeSet;
use std::sync::atomic::{AtomicU64, Ordering};

use chrono::{DateTime, NaiveDate, Utc};
use sqlx::postgres::PgPoolOptions;
use sqlx::{Executor, PgPool};
use structs_game_db::seed::{SeedSummary, fixture_puzzles, seed_fixtures, seed_today_if_missing};
use structs_game_db::{
    DailyPuzzleRecord, InsertOutcome, NewDailyPuzzle, PuzzleInstance, get_public_puzzle_by_date,
    get_puzzle_by_date, insert_puzzle, list_puzzles_in_range, migrate,
};

/// The fixture schedule: each date and the template it runs.
const SCHEDULE: [(&str, &str); 7] = [
    ("2026-04-04", "insertion-beats-merge"),
    ("2026-04-05", "upset-bst-beats-avl"),
    ("2026-04-06", "linked-list-index-drift"),
    ("2026-10-03", "quicksort-most-comparisons"),
    ("2026-10-04", "bubble-exact-passes"),
    ("2026-10-05", "avl-most-rotations"),
    ("2026-10-07", "bst-forced-order"),
];

/// The day left unscheduled so the e2e suite sees a real 404.
const GAP: &str = "2026-10-06";

/// Keys that must never appear in a public puzzle.
const PRIVATE_KEYS: [&str; 10] = [
    "seed",
    "best",
    "bestScore",
    "best_score",
    "bestSolution",
    "best_solution",
    "botGoalRate",
    "botBestRate",
    "bot_goal_rate",
    "rules",
];

fn day(text: &str) -> NaiveDate {
    text.parse()
        .unwrap_or_else(|e| panic!("test date {text:?} is not YYYY-MM-DD: {e}"))
}

fn summary(s: &SeedSummary) -> String {
    format!(
        "SeedSummary {{ inserted: {}, existing: {} }}",
        s.inserted, s.existing
    )
}

/// The fixtures as `(date, template)`, sorted by date.
fn schedule_of(puzzles: &[NewDailyPuzzle]) -> Vec<(String, &'static str)> {
    let mut got: Vec<_> = puzzles
        .iter()
        .map(|p| (p.puzzle_date.to_string(), p.instance.template_id()))
        .collect();
    got.sort();
    got
}

#[test]
fn fixtures_cover_every_template_on_the_daylight_saving_dates() {
    let puzzles = fixture_puzzles();
    let got = schedule_of(&puzzles);
    let want: Vec<(String, &str)> = SCHEDULE.iter().map(|&(d, t)| (d.to_owned(), t)).collect();
    assert_eq!(
        got, want,
        "fixture_puzzles(): expected exactly these (date, template) pairs {want:?}, got {got:?}"
    );
    let templates: BTreeSet<_> = puzzles.iter().map(|p| p.instance.template_id()).collect();
    assert_eq!(
        templates.len(),
        7,
        "fixture_puzzles(): expected all 7 launch templates once each, got {templates:?}"
    );
    assert!(
        puzzles.iter().all(|p| p.puzzle_date != day(GAP)),
        "fixture_puzzles(): {GAP} must stay unscheduled (the e2e not-ready day), got {got:?}"
    );
    assert_eq!(
        fixture_puzzles(),
        puzzles,
        "fixture_puzzles(): two calls should return identical puzzles (deterministic seeding)"
    );
}

#[test]
fn the_quicksort_fixture_is_daily_12() {
    let puzzles = fixture_puzzles();
    let quicksort = puzzles
        .iter()
        .find(|p| p.puzzle_date == day("2026-10-03"))
        .unwrap_or_else(|| panic!("fixture_puzzles(): nothing scheduled on 2026-10-03"));
    let want = PuzzleInstance::Quicksort {
        values: vec![8, 1, 6, 3, 2, 7, 4, 5],
        fixed: vec![1, 4, 6],
    };
    assert_eq!(
        quicksort.instance, want,
        "fixture on 2026-10-03: expected DAILY_12 from e2e/support/daily-fixtures.ts \
         ({want:?}), got {:?}",
        quicksort.instance
    );
    assert_eq!(
        quicksort.goal, 34,
        "fixture on 2026-10-03: expected DAILY_12's par 34 as the goal, got {}",
        quicksort.goal
    );
}

#[test]
fn every_fixture_is_valid_and_its_best_solution_scores_its_best_score() {
    for puzzle in fixture_puzzles() {
        let call = format!(
            "fixture {} {}",
            puzzle.puzzle_date,
            puzzle.instance.template_id()
        );
        if let Err(err) = puzzle.instance.validate_shape() {
            panic!("{call}: validate_shape() should accept the instance, got {err:?}");
        }
        let score = puzzle.instance.score_solution(&puzzle.best_solution);
        assert!(
            matches!(score, Ok(Some(s)) if s == puzzle.best_score),
            "{call}: best_solution {:?} should solve the puzzle with best_score {}, got {score:?}",
            puzzle.best_solution,
            puzzle.best_score
        );
        assert!(
            puzzle.template_version >= 1 && !puzzle.rules.trim().is_empty(),
            "{call}: expected template_version >= 1 and non-empty rules, got version {} rules {:?}",
            puzzle.template_version,
            puzzle.rules
        );
        for (name, rate) in [
            ("bot_goal_rate", puzzle.bot_goal_rate),
            ("bot_best_rate", puzzle.bot_best_rate),
        ] {
            assert!(
                (0.0..=1.0).contains(&rate),
                "{call}: {name} should be within 0.0..=1.0, got {rate}"
            );
        }
    }
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
    let schema = format!("structs_game_seed_test_{}_{seq}", std::process::id());
    let admin = structs_game_db::connect(&url)
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

#[tokio::test]
async fn seeding_inserts_every_fixture_once_and_is_idempotent() {
    with_test_db("seeding_inserts_every_fixture_once_and_is_idempotent", |pool| async move {
        let first = seed_fixtures(&pool)
            .await
            .unwrap_or_else(|e| panic!("seed_fixtures on an empty schema failed: {e:?}"));
        assert!(
            first.inserted == 7 && first.existing == 0,
            "first seed_fixtures on an empty schema: expected inserted 7, existing 0, got {}",
            summary(&first)
        );
        let mut before = Vec::new();
        for (date, _) in SCHEDULE {
            before.push(get_puzzle_by_date(&pool, day(date)).await.unwrap_or_else(|e| {
                panic!("get_puzzle_by_date({date}) after the first seed failed: {e:?}")
            }));
        }
        let second = seed_fixtures(&pool)
            .await
            .unwrap_or_else(|e| panic!("second seed_fixtures failed: {e:?}"));
        assert!(
            second.inserted == 0 && second.existing == 7,
            "second seed_fixtures on the seeded schema: expected inserted 0, existing 7, got {}",
            summary(&second)
        );
        for ((date, _), was) in SCHEDULE.iter().zip(before) {
            let now = get_puzzle_by_date(&pool, day(date)).await.unwrap_or_else(|e| {
                panic!("get_puzzle_by_date({date}) after the second seed failed: {e:?}")
            });
            assert_eq!(
                now, was,
                "{date}: a second seed_fixtures must leave the stored record unchanged"
            );
        }
        let numbers: BTreeSet<u32> = stored_numbers(&pool).await.into_iter().collect();
        assert_eq!(
            numbers.len(),
            7,
            "after seeding: expected 7 distinct puzzle numbers, got {numbers:?}"
        );
    })
    .await;
}

/// The stored puzzle numbers of every fixture date.
async fn stored_numbers(pool: &PgPool) -> Vec<u32> {
    let mut numbers = Vec::new();
    for (date, _) in SCHEDULE {
        if let Ok(Some(record)) = get_puzzle_by_date(pool, day(date)).await {
            numbers.push(record.number);
        }
    }
    numbers
}

#[tokio::test]
async fn seeded_puzzles_are_public_without_private_fields() {
    with_test_db(
        "seeded_puzzles_are_public_without_private_fields",
        |pool| async move {
            seed_fixtures(&pool)
                .await
                .unwrap_or_else(|e| panic!("seed_fixtures on an empty schema failed: {e:?}"));
            let fixtures = fixture_puzzles();
            for (date, template) in SCHEDULE {
                let call = format!("get_public_puzzle_by_date({date}) after seed_fixtures");
                let public = get_public_puzzle_by_date(&pool, day(date))
                    .await
                    .unwrap_or_else(|e| panic!("{call}: query failed: {e:?}"))
                    .unwrap_or_else(|| panic!("{call}: expected the {template} fixture, got None"));
                let fixture = fixtures
                    .iter()
                    .find(|p| p.puzzle_date == day(date))
                    .unwrap_or_else(|| panic!("fixture_puzzles(): nothing scheduled on {date}"));
                assert!(
                    public.date == day(date)
                        && public.instance == fixture.instance
                        && public.par == fixture.goal,
                    "{call}: expected date {date}, instance {:?}, par {}; got {public:?}",
                    fixture.instance,
                    fixture.goal
                );
                let json = serde_json::to_value(&public).expect("serialize PublicPuzzle");
                assert_eq!(
                    json["template"].as_str(),
                    Some(template),
                    "{call}: expected template {template:?}, got {json}"
                );
                for key in PRIVATE_KEYS {
                    assert!(
                        json.get(key).is_none(),
                        "{call}: private key {key:?} must not be in the public puzzle, got {json}"
                    );
                }
            }
            let gap = get_public_puzzle_by_date(&pool, day(GAP))
                .await
                .unwrap_or_else(|e| panic!("get_public_puzzle_by_date({GAP}) failed: {e:?}"));
            assert!(
                gap.is_none(),
                "get_public_puzzle_by_date({GAP}) after seed_fixtures: the gap day must stay \
             unscheduled, got {gap:?}"
            );
        },
    )
    .await;
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
fn quicksort_on(date: NaiveDate) -> NewDailyPuzzle {
    let mut puzzle = fixture_puzzles()
        .into_iter()
        .find(|p| p.puzzle_date == day("2026-10-03"))
        .unwrap_or_else(|| panic!("fixture_puzzles(): nothing scheduled on 2026-10-03"));
    puzzle.puzzle_date = date;
    puzzle
}

/// A puzzle for `date` that is not the quicksort fixture: the bubble fixture
/// from 2026-10-04, moved.
fn bubble_on(date: NaiveDate) -> NewDailyPuzzle {
    let mut puzzle = fixture_puzzles()
        .into_iter()
        .find(|p| p.puzzle_date == day("2026-10-04"))
        .unwrap_or_else(|| panic!("fixture_puzzles(): nothing scheduled on 2026-10-04"));
    puzzle.puzzle_date = date;
    puzzle
}

/// The record the store should hold for `puzzle` once numbered `number`.
fn record_of(puzzle: &NewDailyPuzzle, number: u32) -> DailyPuzzleRecord {
    DailyPuzzleRecord {
        puzzle_date: puzzle.puzzle_date,
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
            r.puzzle_date,
            r.number,
            r.instance.template_id()
        ),
        Some(InsertOutcome::AlreadyScheduled(r)) => format!(
            "Some(AlreadyScheduled(date {}, number {}, template {}))",
            r.puzzle_date,
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
    list_puzzles_in_range(pool, day("2026-01-01"), day("2026-12-31"))
        .await
        .unwrap_or_else(|e| panic!("{call}: list_puzzles_in_range(2026) failed: {e:?}"))
        .iter()
        .map(|r| (r.puzzle_date.to_string(), r.instance.template_id()))
        .collect()
}

/// Checks that `now` (UTC) is scheduled on Sydney date `want`, on an empty
/// schema: the outcome is `Inserted` for `want`, and only `want` holds a puzzle.
async fn assert_seeds_sydney_date(pool: &PgPool, now: &str, sydney: &str, want: &str) {
    let call = format!("seed_today_if_missing(now = {now}, Sydney {sydney}) on an empty schema");
    let outcome = seed_today_at(pool, now).await;
    let inserted_date = match &outcome {
        Some(InsertOutcome::Inserted(r)) => Some(r.puzzle_date.to_string()),
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
            let stored = get_puzzle_by_date(&pool, date)
                .await
                .unwrap_or_else(|e| panic!("{call}: get_puzzle_by_date(2026-11-15) failed: {e:?}"));
            assert_eq!(
                stored.as_ref(),
                Some(returned),
                "{call}: get_puzzle_by_date(2026-11-15) should return the same record the \
                 call returned; expected left, got right"
            );
            let public = get_public_puzzle_by_date(&pool, date)
                .await
                .unwrap_or_else(|e| {
                    panic!("{call}: get_public_puzzle_by_date(2026-11-15) failed: {e:?}")
                });
            assert!(
                matches!(&public, Some(p) if p.date == date && p.instance == want.instance && p.par == want.goal),
                "{call}: get_public_puzzle_by_date(2026-11-15) should show date 2026-11-15, \
                 instance {:?}, par {}; got {public:?}",
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
            let existing = match insert_puzzle(&pool, &bubble_on(date)).await {
                Ok(InsertOutcome::Inserted(record)) => record,
                other => panic!(
                    "setup: insert_puzzle(bubble on 2026-11-20) should insert, got {other:?}"
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
            let stored = get_puzzle_by_date(&pool, date)
                .await
                .unwrap_or_else(|e| panic!("{call}: get_puzzle_by_date(2026-11-20) failed: {e:?}"));
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
                let gap = get_puzzle_by_date(&pool, day(GAP))
                    .await
                    .unwrap_or_else(|e| panic!("{call}: get_puzzle_by_date({GAP}) failed: {e:?}"));
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
