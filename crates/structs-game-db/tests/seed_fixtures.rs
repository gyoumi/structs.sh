//! The deterministic dev/CI seeder `structs_game_db::seed`: one fixture per
//! launch template on fixed dates around Sydney's 2026 daylight saving
//! changes, with 2026-10-06 left unscheduled on purpose.
//!
//! `fixture_puzzles` is checked without a database. The `seed_fixtures`
//! tests run only when `DATABASE_URL` is set, each in its own disposable
//! schema (as in `postgres_roundtrip.rs`).

use std::collections::BTreeSet;
use std::sync::atomic::{AtomicU64, Ordering};

use chrono::NaiveDate;
use sqlx::postgres::PgPoolOptions;
use sqlx::{Executor, PgPool};
use structs_game_db::seed::{SeedSummary, fixture_puzzles, seed_fixtures};
use structs_game_db::{
    NewDailyPuzzle, PuzzleInstance, get_public_puzzle_by_date, get_puzzle_by_date, migrate,
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
