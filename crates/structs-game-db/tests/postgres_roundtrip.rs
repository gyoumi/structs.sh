//! Postgres integration tests. They run only when `DATABASE_URL` is set, for
//! example against `docker compose -f docker-compose.game-db.yml up`:
//! `DATABASE_URL=postgres://structs:structs@localhost:5432/structs_game`.
//! Each test creates and drops its own disposable schema so scheduled rows in
//! `public.daily_puzzles` are never touched.

mod common;

use std::sync::atomic::{AtomicU64, Ordering};

use chrono::NaiveDate;
use common::{date, expected_record, new_puzzle, samples};
use sqlx::postgres::PgPoolOptions;
use sqlx::{Executor, PgPool};
use structs_game_db::{
    DailyPuzzleRecord, DbError, InsertOutcome, NewDailyPuzzle, PuzzleInstance, PuzzleSolution,
    get_public_puzzle_by_date, get_puzzle_by_date, insert_puzzle, list_public_puzzles_in_range,
    list_puzzles_in_range, migrate,
};
use structs_puzzles::linked_list_index_drift::Operation;

static NEXT_SCHEMA: AtomicU64 = AtomicU64::new(1);

const SEEDS: [u64; 7] = [
    0,
    i64::MAX as u64,
    u64::MAX,
    1,
    42,
    (i64::MAX as u64) + 1,
    2026,
];

/// A migrated pool bound to a unique disposable schema.
struct TestDb {
    admin: PgPool,
    pool: PgPool,
    schema: String,
}

impl TestDb {
    async fn cleanup(self) {
        self.pool.close().await;
        sqlx::query(&format!(
            "DROP SCHEMA IF EXISTS \"{}\" CASCADE",
            self.schema
        ))
        .execute(&self.admin)
        .await
        .expect("drop disposable test schema");
        self.admin.close().await;
    }
}

/// Creates a disposable migrated schema, or returns `None` when `DATABASE_URL` is unset.
async fn setup(test: &str) -> Option<TestDb> {
    let Ok(url) = std::env::var("DATABASE_URL") else {
        eprintln!("{test}: DATABASE_URL is not set, skipping the Postgres test");
        return None;
    };
    let seq = NEXT_SCHEMA.fetch_add(1, Ordering::Relaxed);
    let schema = format!("structs_game_db_test_{}_{seq}", std::process::id());
    let admin = structs_game_db::connect(&url)
        .await
        .expect("connect to DATABASE_URL");
    sqlx::query(&format!("CREATE SCHEMA \"{schema}\""))
        .execute(&admin)
        .await
        .expect("create disposable test schema");
    let schema_for_conn = schema.clone();
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .after_connect(move |conn, _meta| {
            let schema_name = schema_for_conn.clone();
            Box::pin(async move {
                conn.execute(format!("SET search_path TO \"{schema_name}\"").as_str())
                    .await?;
                Ok(())
            })
        })
        .connect(&url)
        .await
        .expect("connect pool to disposable test schema");
    migrate(&pool)
        .await
        .expect("first migrate on the test schema");
    Some(TestDb {
        admin,
        pool,
        schema,
    })
}

async fn insert_new(pool: &PgPool, puzzle: &NewDailyPuzzle) -> DailyPuzzleRecord {
    match insert_puzzle(pool, puzzle).await {
        Ok(InsertOutcome::Inserted(record)) => record,
        other => panic!(
            "insert on empty date {}: got {other:?}, want Inserted",
            puzzle.puzzle_date
        ),
    }
}

/// The seven launch puzzles on consecutive days from 2026-12-01.
fn week() -> Vec<NewDailyPuzzle> {
    samples(SEEDS)
        .iter()
        .zip(1..)
        .map(|(sample, day)| new_puzzle(sample, date(2026, 12, day)))
        .collect()
}

#[tokio::test]
async fn migrate_runs_cleanly_twice() {
    let Some(db) = setup("migrate_runs_cleanly_twice").await else {
        return;
    };
    migrate(&db.pool)
        .await
        .expect("second migrate should be a no-op");
    migrate(&db.pool)
        .await
        .expect("third migrate should be a no-op");
    db.cleanup().await;
}

#[tokio::test]
async fn inserts_every_template_with_sequential_numbers_and_full_round_trip() {
    let Some(db) = setup("inserts_every_template").await else {
        return;
    };
    let mut puzzles = week();
    puzzles[0].bot_goal_rate = 0.0;
    puzzles[0].bot_best_rate = 1.0;
    puzzles[1].bot_goal_rate = 1.0;
    puzzles[1].bot_best_rate = 0.0;
    puzzles[2].bot_goal_rate = 0.123_456_789_012_345_67;
    puzzles[3].template_version = i32::MAX as u32;
    for (puzzle, number) in puzzles.iter().zip(1..) {
        let id = puzzle.instance.template_id();
        let inserted = insert_new(&db.pool, puzzle).await;
        assert_eq!(
            inserted,
            expected_record(puzzle, number),
            "{id} seed {}: Inserted record",
            puzzle.seed
        );
        let stored = get_puzzle_by_date(&db.pool, puzzle.puzzle_date)
            .await
            .expect("get_puzzle_by_date");
        assert_eq!(
            stored,
            Some(expected_record(puzzle, number)),
            "{id} seed {}: stored record read back by date",
            puzzle.seed
        );
    }
    db.cleanup().await;
}

#[tokio::test]
async fn reinserting_a_scheduled_date_keeps_the_original_and_leaves_no_number_gap() {
    let Some(db) = setup("reinserting_a_scheduled_date").await else {
        return;
    };
    let puzzles = week();
    let original = insert_new(&db.pool, &puzzles[0]).await;
    assert_eq!(original.number, 1, "first puzzle number");

    let mut clash = puzzles[1].clone();
    clash.puzzle_date = puzzles[0].puzzle_date;
    let outcome = insert_puzzle(&db.pool, &clash)
        .await
        .expect("insert on a scheduled date");
    assert_eq!(
        outcome,
        InsertOutcome::AlreadyScheduled(original.clone()),
        "second insert on {} should return the original untouched",
        clash.puzzle_date
    );
    let stored = get_puzzle_by_date(&db.pool, original.puzzle_date)
        .await
        .expect("get_puzzle_by_date");
    assert_eq!(
        stored,
        Some(original),
        "the clash must not overwrite the stored puzzle"
    );

    let next = insert_new(&db.pool, &puzzles[2]).await;
    assert_eq!(
        next.number, 2,
        "the next new date after a clash gets number 2, not 3 (no gap)"
    );
    db.cleanup().await;
}

#[tokio::test]
async fn get_by_date_returns_none_when_missing_and_the_record_when_stored() {
    let Some(db) = setup("get_by_date").await else {
        return;
    };
    let puzzles = week();
    let missing = date(2026, 12, 25);
    let got = get_puzzle_by_date(&db.pool, missing)
        .await
        .expect("get on empty table");
    assert_eq!(got, None, "get_puzzle_by_date({missing}) on an empty table");
    let got = get_public_puzzle_by_date(&db.pool, missing)
        .await
        .expect("public get on empty table");
    assert_eq!(
        got, None,
        "get_public_puzzle_by_date({missing}) on an empty table"
    );

    let record = insert_new(&db.pool, &puzzles[6]).await;
    let got = get_puzzle_by_date(&db.pool, record.puzzle_date)
        .await
        .expect("get stored date");
    assert_eq!(
        got.as_ref(),
        Some(&record),
        "get_puzzle_by_date({})",
        record.puzzle_date
    );
    let got = get_public_puzzle_by_date(&db.pool, record.puzzle_date)
        .await
        .expect("public get");
    assert_eq!(
        got,
        Some(record.to_public()),
        "get_public_puzzle_by_date({})",
        record.puzzle_date
    );
    let got = get_puzzle_by_date(&db.pool, missing)
        .await
        .expect("get other date");
    assert_eq!(
        got, None,
        "get_puzzle_by_date({missing}) with only {} stored",
        record.puzzle_date
    );
    db.cleanup().await;
}

fn dates(records: &[DailyPuzzleRecord]) -> Vec<NaiveDate> {
    records.iter().map(|record| record.puzzle_date).collect()
}

#[tokio::test]
async fn list_in_range_is_inclusive_and_ordered_by_date() {
    let Some(db) = setup("list_in_range").await else {
        return;
    };
    let puzzles = week();
    for i in [4, 0, 6, 2] {
        insert_new(&db.pool, &puzzles[i]).await;
    }
    let (d1, d3, d5, d7) = (
        date(2026, 12, 1),
        date(2026, 12, 3),
        date(2026, 12, 5),
        date(2026, 12, 7),
    );
    let cases = [
        (d1, d7, vec![d1, d3, d5, d7]),
        (d3, d5, vec![d3, d5]),
        (d3, d3, vec![d3]),
        (date(2026, 12, 2), date(2026, 12, 6), vec![d3, d5]),
        (date(2026, 12, 2), date(2026, 12, 2), vec![]),
        (date(2026, 11, 1), date(2026, 11, 30), vec![]),
        (d7, date(2027, 1, 31), vec![d7]),
    ];
    for (start, end, want) in cases {
        let records = list_puzzles_in_range(&db.pool, start, end)
            .await
            .expect("list_puzzles_in_range");
        assert_eq!(
            dates(&records),
            want,
            "list_puzzles_in_range({start}, {end}) dates"
        );
        let public = list_public_puzzles_in_range(&db.pool, start, end)
            .await
            .expect("list public");
        let want_public: Vec<_> = records.iter().map(DailyPuzzleRecord::to_public).collect();
        assert_eq!(
            public, want_public,
            "list_public_puzzles_in_range({start}, {end})"
        );
    }
    db.cleanup().await;
}

/// Invalid variants of one valid puzzle, each labelled with what is wrong.
fn invalid_variants(
    valid: &NewDailyPuzzle,
    drift: &NewDailyPuzzle,
) -> Vec<(&'static str, NewDailyPuzzle)> {
    let with = |label, change: &dyn Fn(&mut NewDailyPuzzle)| {
        let mut puzzle = valid.clone();
        change(&mut puzzle);
        (label, puzzle)
    };
    let mut cases = vec![
        with("template_version 0", &|p| p.template_version = 0),
        with("template_version u32::MAX", &|p| {
            p.template_version = u32::MAX
        }),
        with("empty rules", &|p| p.rules = String::new()),
        with("whitespace-only rules", &|p| p.rules = "  \n\t ".to_owned()),
        with("empty quicksort values", &|p| {
            p.instance = PuzzleInstance::Quicksort {
                values: vec![],
                fixed: vec![],
            };
            p.best_solution = PuzzleSolution::Arrangement(vec![]);
            p.best_score = 0;
            p.goal = 0;
        }),
        with("non-canonical bst targetTree", &|p| {
            p.instance = PuzzleInstance::BstForcedOrder {
                values: vec![1, 2, 3],
                target_tree: vec![2, 3, 1],
            };
            p.best_solution = PuzzleSolution::Arrangement(vec![2, 1, 3]);
            p.best_score = 2;
            p.goal = 1;
        }),
        with("higher-wins goal above best_score", &|p| {
            p.goal = p.best_score + 1
        }),
        with("bot_goal_rate -0.1", &|p| p.bot_goal_rate = -0.1),
        with("bot_goal_rate 1.1", &|p| p.bot_goal_rate = 1.1),
        with("bot_goal_rate NaN", &|p| p.bot_goal_rate = f64::NAN),
        with("bot_best_rate -0.1", &|p| p.bot_best_rate = -0.1),
        with("bot_best_rate 1.1", &|p| p.bot_best_rate = 1.1),
        with("bot_best_rate NaN", &|p| p.bot_best_rate = f64::NAN),
        with("operations solution for an arrangement template", &|p| {
            p.best_solution = PuzzleSolution::Operations(vec![Operation::Delete { index: 0 }]);
        }),
        with("best_score one above the solution's score", &|p| {
            p.best_score += 1
        }),
        with("best_solution the template rejects", &|p| {
            p.best_solution = PuzzleSolution::Arrangement(vec![i32::MIN]);
        }),
    ];
    let mut impossible_low = drift.clone();
    impossible_low.puzzle_date = valid.puzzle_date;
    assert!(
        impossible_low.best_score >= 1,
        "fixture: drift must cost at least 1"
    );
    impossible_low.goal = impossible_low.best_score - 1;
    cases.push(("lower-wins goal below best_score", impossible_low));
    let mut unsolved = drift.clone();
    unsolved.puzzle_date = valid.puzzle_date;
    unsolved.best_solution = PuzzleSolution::Operations(vec![]);
    cases.push((
        "index drift best_solution that does not reach the target",
        unsolved,
    ));
    let mut wrong_kind = drift.clone();
    wrong_kind.puzzle_date = valid.puzzle_date;
    wrong_kind.best_solution = PuzzleSolution::Arrangement(vec![1, 2, 3]);
    cases.push(("arrangement solution for index drift", wrong_kind));
    cases
}

#[tokio::test]
async fn validation_rejects_invalid_puzzles_before_inserting() {
    let Some(db) = setup("validation_rejects").await else {
        return;
    };
    let puzzles = week();
    let valid = &puzzles[0];
    let drift = &puzzles[6];
    if let PuzzleInstance::LinkedListIndexDrift { start, target } = &drift.instance {
        assert_ne!(
            start, target,
            "fixture: drift seed {} must need operations",
            drift.seed
        );
    }
    for (label, puzzle) in invalid_variants(valid, drift) {
        let got = insert_puzzle(&db.pool, &puzzle).await;
        assert!(
            matches!(got, Err(DbError::InvalidData(_))),
            "insert with {label}: got {got:?}, want Err(InvalidData)"
        );
        let stored = get_puzzle_by_date(&db.pool, puzzle.puzzle_date)
            .await
            .expect("get after reject");
        assert_eq!(stored, None, "insert with {label} must not store a row");
    }
    let record = insert_new(&db.pool, valid).await;
    assert_eq!(
        record.number, 1,
        "rejected inserts must not use up puzzle numbers"
    );
    db.cleanup().await;
}
