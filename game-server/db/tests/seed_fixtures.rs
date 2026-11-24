//! The deterministic dev/CI seeder `daily_db::seed`: one fixture per
//! launch template on fixed dates around Sydney's 2026 daylight saving
//! changes, with 2026-10-06 left unscheduled on purpose.
//!
//! `fixture_challenges` is checked without a database. The `seed_fixtures`
//! tests run only when `DATABASE_URL` is set, each in its own disposable
//! schema (`common::with_test_db`). `seed_today_if_missing` is tested
//! in `seed_today.rs`.

mod common;

use std::collections::BTreeSet;

use common::{GAP, PRIVATE_KEYS, day, with_test_db};
use daily_db::seed::{SeedSummary, fixture_challenges, seed_fixtures};
use daily_db::{
    ChallengeInstance, NewDailyChallenge, get_challenge_by_date, get_public_challenge_by_date,
};
use sqlx::PgPool;

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

fn summary(s: &SeedSummary) -> String {
    format!(
        "SeedSummary {{ inserted: {}, existing: {} }}",
        s.inserted, s.existing
    )
}

/// The fixtures as `(date, template)`, sorted by date.
fn schedule_of(challenges: &[NewDailyChallenge]) -> Vec<(String, &'static str)> {
    let mut got: Vec<_> = challenges
        .iter()
        .map(|p| (p.challenge_date.to_string(), p.instance.template_id()))
        .collect();
    got.sort();
    got
}

#[test]
fn fixtures_cover_every_template_on_the_daylight_saving_dates() {
    let challenges = fixture_challenges();
    let got = schedule_of(&challenges);
    let want: Vec<(String, &str)> = SCHEDULE.iter().map(|&(d, t)| (d.to_owned(), t)).collect();
    assert_eq!(
        got, want,
        "fixture_challenges(): expected exactly these (date, template) pairs {want:?}, got {got:?}"
    );
    let templates: BTreeSet<_> = challenges
        .iter()
        .map(|p| p.instance.template_id())
        .collect();
    assert_eq!(
        templates.len(),
        7,
        "fixture_challenges(): expected all 7 launch templates once each, got {templates:?}"
    );
    assert!(
        challenges.iter().all(|p| p.challenge_date != day(GAP)),
        "fixture_challenges(): {GAP} must stay unscheduled (the e2e not-ready day), got {got:?}"
    );
    assert_eq!(
        fixture_challenges(),
        challenges,
        "fixture_challenges(): two calls should return identical challenges (deterministic seeding)"
    );
}

#[test]
fn the_quicksort_fixture_is_daily_12() {
    let challenges = fixture_challenges();
    let quicksort = challenges
        .iter()
        .find(|p| p.challenge_date == day("2026-10-03"))
        .unwrap_or_else(|| panic!("fixture_challenges(): nothing scheduled on 2026-10-03"));
    let want = ChallengeInstance::Quicksort {
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
        "fixture on 2026-10-03: expected DAILY_12's goal 34 as the goal, got {}",
        quicksort.goal
    );
}

#[test]
fn every_fixture_is_valid_and_its_best_solution_scores_its_best_score() {
    for challenge in fixture_challenges() {
        let call = format!(
            "fixture {} {}",
            challenge.challenge_date,
            challenge.instance.template_id()
        );
        if let Err(err) = challenge.instance.validate_shape() {
            panic!("{call}: validate_shape() should accept the instance, got {err:?}");
        }
        let score = challenge.instance.score_solution(&challenge.best_solution);
        assert!(
            matches!(score, Ok(Some(s)) if s == challenge.best_score),
            "{call}: best_solution {:?} should solve the challenge with best_score {}, got {score:?}",
            challenge.best_solution,
            challenge.best_score
        );
        assert!(
            challenge.template_version >= 1 && !challenge.rules.trim().is_empty(),
            "{call}: expected template_version >= 1 and non-empty rules, got version {} rules {:?}",
            challenge.template_version,
            challenge.rules
        );
        for (name, rate) in [
            ("bot_goal_rate", challenge.bot_goal_rate),
            ("bot_best_rate", challenge.bot_best_rate),
        ] {
            assert!(
                (0.0..=1.0).contains(&rate),
                "{call}: {name} should be within 0.0..=1.0, got {rate}"
            );
        }
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
            before.push(get_challenge_by_date(&pool, day(date)).await.unwrap_or_else(|e| {
                panic!("get_challenge_by_date({date}) after the first seed failed: {e:?}")
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
            let now = get_challenge_by_date(&pool, day(date)).await.unwrap_or_else(|e| {
                panic!("get_challenge_by_date({date}) after the second seed failed: {e:?}")
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
            "after seeding: expected 7 distinct challenge numbers, got {numbers:?}"
        );
    })
    .await;
}

/// The stored challenge numbers of every fixture date.
async fn stored_numbers(pool: &PgPool) -> Vec<u32> {
    let mut numbers = Vec::new();
    for (date, _) in SCHEDULE {
        if let Ok(Some(record)) = get_challenge_by_date(pool, day(date)).await {
            numbers.push(record.number);
        }
    }
    numbers
}

#[tokio::test]
async fn seeded_challenges_are_public_without_private_fields() {
    with_test_db(
        "seeded_challenges_are_public_without_private_fields",
        |pool| async move {
            seed_fixtures(&pool)
                .await
                .unwrap_or_else(|e| panic!("seed_fixtures on an empty schema failed: {e:?}"));
            let fixtures = fixture_challenges();
            for (date, template) in SCHEDULE {
                let call = format!("get_public_challenge_by_date({date}) after seed_fixtures");
                let public = get_public_challenge_by_date(&pool, day(date))
                    .await
                    .unwrap_or_else(|e| panic!("{call}: query failed: {e:?}"))
                    .unwrap_or_else(|| panic!("{call}: expected the {template} fixture, got None"));
                let fixture = fixtures
                    .iter()
                    .find(|p| p.challenge_date == day(date))
                    .unwrap_or_else(|| panic!("fixture_challenges(): nothing scheduled on {date}"));
                assert!(
                    public.date == day(date)
                        && public.instance == fixture.instance
                        && public.goal == fixture.goal,
                    "{call}: expected date {date}, instance {:?}, goal {}; got {public:?}",
                    fixture.instance,
                    fixture.goal
                );
                let json = serde_json::to_value(&public).expect("serialize PublicChallenge");
                assert_eq!(
                    json["template"].as_str(),
                    Some(template),
                    "{call}: expected template {template:?}, got {json}"
                );
                for key in PRIVATE_KEYS {
                    assert!(
                        json.get(key).is_none(),
                        "{call}: private key {key:?} must not be in the public challenge, got {json}"
                    );
                }
            }
            let gap = get_public_challenge_by_date(&pool, day(GAP))
                .await
                .unwrap_or_else(|e| panic!("get_public_challenge_by_date({GAP}) failed: {e:?}"));
            assert!(
                gap.is_none(),
                "get_public_challenge_by_date({GAP}) after seed_fixtures: the gap day must stay \
             unscheduled, got {gap:?}"
            );
        },
    )
    .await;
}
