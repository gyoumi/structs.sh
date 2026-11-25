//! Postgres integration tests. They run only when `DATABASE_URL` is set, for
//! example against `docker compose -f docker-compose.daily-db.yml up`:
//! `DATABASE_URL=postgres://daily:daily@localhost:5432/daily_challenges`.
//! Each test creates and drops its own disposable schema so scheduled rows in
//! `public.daily_challenges` are never touched.

mod common;

use chrono::NaiveDate;
use common::{date, expected_record, new_challenge, samples, with_test_db};
use daily_challenges::linked_list_index_drift::Operation;
use daily_db::{
    ChallengeInstance, ChallengeSolution, DailyChallengeRecord, DbError, InsertOutcome,
    NewDailyChallenge, get_challenge_by_date, get_public_challenge_by_date, insert_challenge,
    list_challenges_in_range, list_public_challenges_in_range, migrate,
};
use sqlx::PgPool;

const SEEDS: [u64; 7] = [
    0,
    i64::MAX as u64,
    u64::MAX,
    1,
    42,
    (i64::MAX as u64) + 1,
    2026,
];

async fn insert_new(pool: &PgPool, challenge: &NewDailyChallenge) -> DailyChallengeRecord {
    match insert_challenge(pool, challenge).await {
        Ok(InsertOutcome::Inserted(record)) => record,
        other => panic!(
            "insert on empty date {}: got {other:?}, want Inserted",
            challenge.challenge_date
        ),
    }
}

/// The seven launch challenges on consecutive days from 2026-12-01.
fn week() -> Vec<NewDailyChallenge> {
    samples(SEEDS)
        .iter()
        .zip(1..)
        .map(|(sample, day)| new_challenge(sample, date(2026, 12, day)))
        .collect()
}

#[tokio::test]
async fn migrate_runs_cleanly_twice() {
    with_test_db("migrate_runs_cleanly_twice", |pool| async move {
        migrate(&pool)
            .await
            .expect("second migrate should be a no-op");
        migrate(&pool)
            .await
            .expect("third migrate should be a no-op");
    })
    .await;
}

#[tokio::test]
async fn inserts_every_template_with_sequential_numbers_and_full_round_trip() {
    with_test_db("inserts_every_template", |pool| async move {
        let mut challenges = week();
        challenges[0].bot_goal_rate = 0.0;
        challenges[0].bot_best_rate = 1.0;
        challenges[1].bot_goal_rate = 1.0;
        challenges[1].bot_best_rate = 0.0;
        challenges[2].bot_goal_rate = 0.123_456_789_012_345_67;
        challenges[3].template_version = i32::MAX as u32;
        for (challenge, number) in challenges.iter().zip(1..) {
            let id = challenge.instance.template_id();
            let inserted = insert_new(&pool, challenge).await;
            assert_eq!(
                inserted,
                expected_record(challenge, number),
                "{id} seed {}: Inserted record",
                challenge.seed
            );
            let stored = get_challenge_by_date(&pool, challenge.challenge_date)
                .await
                .expect("get_challenge_by_date");
            assert_eq!(
                stored,
                Some(expected_record(challenge, number)),
                "{id} seed {}: stored record read back by date",
                challenge.seed
            );
        }
        let dup_bst = NewDailyChallenge {
            challenge_date: date(2026, 12, 8),
            template_version: 1,
            instance: ChallengeInstance::BstForcedOrder {
                values: vec![1, 2, 2, 3],
                target_tree: vec![1, 2, 3],
            },
            rules: "Insert keys to match the target BST.".to_owned(),
            seed: 9,
            goal: 3,
            best_score: 3,
            best_solution: ChallengeSolution::Arrangement(vec![1, 2, 3, 2]),
            bot_goal_rate: 0.5,
            bot_best_rate: 0.5,
        };
        let dup_record = insert_new(&pool, &dup_bst).await;
        assert_eq!(dup_record, expected_record(&dup_bst, 8));
        let stored_dup = get_challenge_by_date(&pool, dup_bst.challenge_date)
            .await
            .expect("get duplicate-key bst by date");
        assert_eq!(stored_dup, Some(expected_record(&dup_bst, 8)));
    })
    .await;
}

#[tokio::test]
async fn reinserting_a_scheduled_date_keeps_the_original_and_leaves_no_number_gap() {
    with_test_db("reinserting_a_scheduled_date", |pool| async move {
        let challenges = week();
        let original = insert_new(&pool, &challenges[0]).await;
        assert_eq!(original.number, 1, "first challenge number");

        let mut clash = challenges[1].clone();
        clash.challenge_date = challenges[0].challenge_date;
        let outcome = insert_challenge(&pool, &clash)
            .await
            .expect("insert on a scheduled date");
        assert_eq!(
            outcome,
            InsertOutcome::AlreadyScheduled(original.clone()),
            "second insert on {} should return the original untouched",
            clash.challenge_date
        );
        let stored = get_challenge_by_date(&pool, original.challenge_date)
            .await
            .expect("get_challenge_by_date");
        assert_eq!(
            stored,
            Some(original),
            "the clash must not overwrite the stored challenge"
        );

        let next = insert_new(&pool, &challenges[2]).await;
        assert_eq!(
            next.number, 2,
            "the next new date after a clash gets number 2, not 3 (no gap)"
        );
    })
    .await;
}

#[tokio::test]
async fn get_by_date_returns_none_when_missing_and_the_record_when_stored() {
    with_test_db("get_by_date", |pool| async move {
        let challenges = week();
        let missing = date(2026, 12, 25);
        let got = get_challenge_by_date(&pool, missing)
            .await
            .expect("get on empty table");
        assert_eq!(
            got, None,
            "get_challenge_by_date({missing}) on an empty table"
        );
        let got = get_public_challenge_by_date(&pool, missing)
            .await
            .expect("public get on empty table");
        assert_eq!(
            got, None,
            "get_public_challenge_by_date({missing}) on an empty table"
        );

        let record = insert_new(&pool, &challenges[6]).await;
        let got = get_challenge_by_date(&pool, record.challenge_date)
            .await
            .expect("get stored date");
        assert_eq!(
            got.as_ref(),
            Some(&record),
            "get_challenge_by_date({})",
            record.challenge_date
        );
        let got = get_public_challenge_by_date(&pool, record.challenge_date)
            .await
            .expect("public get");
        assert_eq!(
            got,
            Some(record.to_public()),
            "get_public_challenge_by_date({})",
            record.challenge_date
        );
        let got = get_challenge_by_date(&pool, missing)
            .await
            .expect("get other date");
        assert_eq!(
            got, None,
            "get_challenge_by_date({missing}) with only {} stored",
            record.challenge_date
        );
    })
    .await;
}

fn dates(records: &[DailyChallengeRecord]) -> Vec<NaiveDate> {
    records.iter().map(|record| record.challenge_date).collect()
}

#[tokio::test]
async fn list_in_range_is_inclusive_and_ordered_by_date() {
    with_test_db("list_in_range", |pool| async move {
        let challenges = week();
        for i in [4, 0, 6, 2] {
            insert_new(&pool, &challenges[i]).await;
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
            let records = list_challenges_in_range(&pool, start, end)
                .await
                .expect("list_challenges_in_range");
            assert_eq!(
                dates(&records),
                want,
                "list_challenges_in_range({start}, {end}) dates"
            );
            let public = list_public_challenges_in_range(&pool, start, end)
                .await
                .expect("list public");
            let want_public: Vec<_> = records
                .iter()
                .map(DailyChallengeRecord::to_public)
                .collect();
            assert_eq!(
                public, want_public,
                "list_public_challenges_in_range({start}, {end})"
            );
        }
    })
    .await;
}

/// Invalid variants of one valid challenge, each labelled with what is wrong.
fn invalid_variants(
    valid: &NewDailyChallenge,
    drift: &NewDailyChallenge,
) -> Vec<(&'static str, NewDailyChallenge)> {
    let with = |label, change: &dyn Fn(&mut NewDailyChallenge)| {
        let mut challenge = valid.clone();
        change(&mut challenge);
        (label, challenge)
    };
    let mut cases = vec![
        with("template_version 0", &|p| p.template_version = 0),
        with("template_version u32::MAX", &|p| {
            p.template_version = u32::MAX
        }),
        with("empty rules", &|p| p.rules = String::new()),
        with("whitespace-only rules", &|p| p.rules = "  \n\t ".to_owned()),
        with("empty quicksort values", &|p| {
            p.instance = ChallengeInstance::Quicksort {
                values: vec![],
                fixed: vec![],
            };
            p.best_solution = ChallengeSolution::Arrangement(vec![]);
            p.best_score = 0;
            p.goal = 0;
        }),
        with("non-canonical bst targetTree", &|p| {
            p.instance = ChallengeInstance::BstForcedOrder {
                values: vec![1, 2, 3],
                target_tree: vec![2, 3, 1],
            };
            p.best_solution = ChallengeSolution::Arrangement(vec![2, 1, 3]);
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
            p.best_solution = ChallengeSolution::Operations(vec![Operation::Delete { index: 0 }]);
        }),
        with("best_score one above the solution's score", &|p| {
            p.best_score += 1
        }),
        with("best_solution the template rejects", &|p| {
            p.best_solution = ChallengeSolution::Arrangement(vec![i32::MIN]);
        }),
    ];
    let mut impossible_low = drift.clone();
    impossible_low.challenge_date = valid.challenge_date;
    assert!(
        impossible_low.best_score >= 1,
        "fixture: drift must cost at least 1"
    );
    impossible_low.goal = impossible_low.best_score - 1;
    cases.push(("lower-wins goal below best_score", impossible_low));
    let mut unsolved = drift.clone();
    unsolved.challenge_date = valid.challenge_date;
    unsolved.best_solution = ChallengeSolution::Operations(vec![]);
    cases.push((
        "index drift best_solution that does not reach the target",
        unsolved,
    ));
    let mut wrong_kind = drift.clone();
    wrong_kind.challenge_date = valid.challenge_date;
    wrong_kind.best_solution = ChallengeSolution::Arrangement(vec![1, 2, 3]);
    cases.push(("arrangement solution for index drift", wrong_kind));
    cases
}

#[tokio::test]
async fn validation_rejects_invalid_challenges_before_inserting() {
    with_test_db("validation_rejects", |pool| async move {
        let challenges = week();
        let valid = &challenges[0];
        let drift = &challenges[6];
        if let ChallengeInstance::LinkedListIndexDrift { start, target } = &drift.instance {
            assert_ne!(
                start, target,
                "fixture: drift seed {} must need operations",
                drift.seed
            );
        }
        for (label, challenge) in invalid_variants(valid, drift) {
            let got = insert_challenge(&pool, &challenge).await;
            assert!(
                matches!(got, Err(DbError::InvalidData(_))),
                "insert with {label}: got {got:?}, want Err(InvalidData)"
            );
            let stored = get_challenge_by_date(&pool, challenge.challenge_date)
                .await
                .expect("get after reject");
            assert_eq!(stored, None, "insert with {label} must not store a row");
        }
        let record = insert_new(&pool, valid).await;
        assert_eq!(
            record.number, 1,
            "rejected inserts must not use up challenge numbers"
        );
    })
    .await;
}
