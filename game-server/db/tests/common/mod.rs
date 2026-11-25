//! Helpers shared by the `daily-db` integration tests, and by the
//! `daily-server` ones through `#[path]`:
//! - fixtures built from the real `daily_challenges` templates, so every
//!   score is the template's own;
//! - [`with_test_db`] and [`with_empty_schema`], which give each test its own
//!   disposable Postgres schema;
//! - small parsers for test dates and instants, and the keys a public
//!   challenge must never carry.
#![allow(dead_code)]

mod private_keys;

use std::sync::atomic::{AtomicU64, Ordering};

use chrono::{DateTime, NaiveDate, Utc};
use daily_challenges::avl_rotations::AvlRotations;
use daily_challenges::bst_forced_order::BstForcedOrder;
use daily_challenges::bubble::Bubble;
use daily_challenges::insertion_beats_merge::InsertionBeatsMerge;
use daily_challenges::linked_list_index_drift::LinkedListIndexDrift;
use daily_challenges::quicksort::Quicksort;
use daily_challenges::upset_bst_beats_avl::UpsetBstBeatsAvl;
use daily_challenges::{SearchSpace, Template};
use daily_db::{
    ChallengeInstance, ChallengeSolution, DailyChallengeRecord, NewDailyChallenge, migrate,
};
use sqlx::postgres::PgPoolOptions;
use sqlx::{Executor, PgPool};

// Not every test crate that includes this module uses every re-export.
#[allow(unused_imports)]
pub use private_keys::PRIVATE_KEYS;

/// The day the fixtures leave unscheduled, so the e2e suite sees a real 404.
pub const GAP: &str = "2026-10-06";

/// One generated instance with candidate solutions scored by the template.
#[derive(Debug, Clone)]
pub struct Sample {
    pub template_id: &'static str,
    pub seed: u64,
    pub instance: ChallengeInstance,
    pub rules: String,
    /// Each candidate with the template's own `solved_score` for it.
    pub scored: Vec<(ChallengeSolution, Option<u32>)>,
}

impl Sample {
    /// The first candidate that solves the challenge, with its score.
    pub fn solved(&self) -> (ChallengeSolution, u32) {
        self.scored
            .iter()
            .find_map(|(solution, score)| score.map(|score| (solution.clone(), score)))
            .unwrap_or_else(|| {
                panic!(
                    "{} seed {}: no solved candidate",
                    self.template_id, self.seed
                )
            })
    }

    /// The first valid candidate that does not solve the challenge, if any.
    pub fn unsolved(&self) -> Option<ChallengeSolution> {
        self.scored
            .iter()
            .find(|(_, score)| score.is_none())
            .map(|(solution, _)| solution.clone())
    }
}

fn sample<T>(template: T, seed: u64, wrap: fn(T::Input) -> ChallengeSolution) -> Sample
where
    T: Template,
    ChallengeInstance: From<T::Instance>,
    T::Instance: Clone,
{
    let instance = template.generate(seed);
    let mut inputs: Vec<T::Input> = template
        .shortcuts(&instance)
        .into_iter()
        .map(|shortcut| shortcut.input)
        .collect();
    inputs.extend((0..16).filter_map(|s| template.random_input(&instance, s)));
    if let SearchSpace::Exhaustive(all) = template.search_space(&instance) {
        inputs.extend(all.take(2000));
    }
    let scored = inputs
        .into_iter()
        .map(|input| {
            let score = template
                .solved_score(&instance, &input)
                .unwrap_or_else(|e| {
                    panic!("{} seed {seed}: template candidate invalid: {e:?}", T::ID)
                });
            (wrap(input), score)
        })
        .collect();
    Sample {
        template_id: T::ID,
        seed,
        rules: template.rules(&instance),
        instance: ChallengeInstance::from(instance),
        scored,
    }
}

/// The seven launch template ids, in the order [`samples`] returns them.
pub const TEMPLATE_IDS: [&str; 7] = [
    "quicksort-most-comparisons",
    "bubble-exact-passes",
    "insertion-beats-merge",
    "avl-most-rotations",
    "bst-forced-order",
    "upset-bst-beats-avl",
    "linked-list-index-drift",
];

/// One sample per launch template, generated from `seeds` in template order.
pub fn samples(seeds: [u64; 7]) -> Vec<Sample> {
    let arrangement = ChallengeSolution::Arrangement as fn(Vec<i32>) -> ChallengeSolution;
    vec![
        sample(Quicksort, seeds[0], arrangement),
        sample(Bubble, seeds[1], arrangement),
        sample(InsertionBeatsMerge, seeds[2], arrangement),
        sample(AvlRotations, seeds[3], arrangement),
        sample(BstForcedOrder, seeds[4], arrangement),
        sample(UpsetBstBeatsAvl, seeds[5], arrangement),
        sample(
            LinkedListIndexDrift,
            seeds[6],
            ChallengeSolution::Operations,
        ),
    ]
}

/// A valid challenge for `date` whose best solution is the sample's first
/// solved candidate.
pub fn new_challenge(sample: &Sample, date: NaiveDate) -> NewDailyChallenge {
    let (best_solution, best_score) = sample.solved();
    NewDailyChallenge {
        challenge_date: date,
        template_version: 1,
        instance: sample.instance.clone(),
        rules: sample.rules.clone(),
        seed: sample.seed,
        goal: best_score,
        best_score,
        best_solution,
        bot_goal_rate: 0.25,
        bot_best_rate: 0.125,
    }
}

/// The record the store should hold for `challenge` once it is numbered `number`.
pub fn expected_record(challenge: &NewDailyChallenge, number: u32) -> DailyChallengeRecord {
    DailyChallengeRecord {
        challenge_date: challenge.challenge_date,
        number,
        template_version: challenge.template_version,
        instance: challenge.instance.clone(),
        rules: challenge.rules.clone(),
        seed: challenge.seed,
        goal: challenge.goal,
        best_score: challenge.best_score,
        best_solution: challenge.best_solution.clone(),
        bot_goal_rate: challenge.bot_goal_rate,
        bot_best_rate: challenge.bot_best_rate,
    }
}

pub fn date(y: i32, m: u32, d: u32) -> NaiveDate {
    NaiveDate::from_ymd_opt(y, m, d).expect("valid test date")
}

/// The date `text`, written `YYYY-MM-DD`.
pub fn day(text: &str) -> NaiveDate {
    text.parse()
        .unwrap_or_else(|e| panic!("test date {text:?} is not YYYY-MM-DD: {e}"))
}

/// The instant `text`, an RFC 3339 timestamp such as `2026-12-01T13:30:00Z`.
pub fn utc(text: &str) -> DateTime<Utc> {
    text.parse()
        .unwrap_or_else(|e| panic!("test instant {text:?} is not RFC 3339: {e}"))
}

static NEXT_SCHEMA: AtomicU64 = AtomicU64::new(1);

/// A pool whose every connection uses one fresh schema, plus the admin pool
/// that created it and will drop it.
struct Schema {
    admin: PgPool,
    pool: PgPool,
    name: String,
}

async fn drop_schema(admin: &PgPool, name: &str) {
    sqlx::query(&format!("DROP SCHEMA IF EXISTS \"{name}\" CASCADE"))
        .execute(admin)
        .await
        .unwrap_or_else(|e| panic!("drop disposable test schema {name}: {e}"));
}

/// Creates an empty schema unique to this process and call, dropping it
/// again if the pool can't connect, or returns `None` when `DATABASE_URL`
/// is unset.
async fn create_schema(test: &str) -> Option<Schema> {
    let Ok(url) = std::env::var("DATABASE_URL") else {
        eprintln!("{test}: DATABASE_URL is not set, skipping the Postgres test");
        return None;
    };
    let seq = NEXT_SCHEMA.fetch_add(1, Ordering::Relaxed);
    let name = format!("daily_test_{}_{seq}", std::process::id());
    let admin = daily_db::connect(&url)
        .await
        .unwrap_or_else(|e| panic!("{test}: connect to DATABASE_URL: {e}"));
    sqlx::query(&format!("CREATE SCHEMA \"{name}\""))
        .execute(&admin)
        .await
        .unwrap_or_else(|e| panic!("{test}: create disposable test schema {name}: {e}"));
    let search_path = format!("SET search_path TO \"{name}\"");
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
    match pool {
        Ok(pool) => Some(Schema { admin, pool, name }),
        Err(err) => {
            drop_schema(&admin, &name).await;
            admin.close().await;
            panic!("{test}: connect a pool to disposable test schema {name}: {err}");
        }
    }
}

/// Runs `body` with a pool on a fresh, empty (unmigrated) schema and drops
/// the schema afterwards, even when `body` panics. Does nothing when
/// `DATABASE_URL` is unset.
pub async fn with_empty_schema<F, Fut>(test: &str, body: F)
where
    F: FnOnce(PgPool) -> Fut + Send + 'static,
    Fut: std::future::Future<Output = ()> + Send + 'static,
{
    let Some(schema) = create_schema(test).await else {
        return;
    };
    let result = tokio::spawn(body(schema.pool.clone())).await;
    schema.pool.close().await;
    drop_schema(&schema.admin, &schema.name).await;
    schema.admin.close().await;
    if let Err(err) = result {
        std::panic::resume_unwind(err.into_panic());
    }
}

/// Runs `body` with a pool on a fresh schema that `daily_db::migrate` has
/// brought up to date, and drops the schema afterwards, even when `body`
/// panics. Does nothing when `DATABASE_URL` is unset.
pub async fn with_test_db<F, Fut>(test: &str, body: F)
where
    F: FnOnce(PgPool) -> Fut + Send + 'static,
    Fut: std::future::Future<Output = ()> + Send + 'static,
{
    let name = test.to_owned();
    with_empty_schema(test, move |pool| async move {
        if let Err(err) = migrate(&pool).await {
            panic!("{name}: migrate the disposable test schema: {err}");
        }
        body(pool).await;
    })
    .await;
}
