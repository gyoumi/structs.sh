//! Helpers shared by the `daily-server` integration tests: a disposable
//! migrated Postgres schema per test, real template puzzles to seed it with,
//! and a one-shot HTTP call against the router.
#![allow(dead_code)]

/// The real-template fixtures shared with the `daily-db` tests.
#[path = "../../../db/tests/common/mod.rs"]
pub mod fixtures;

use std::sync::atomic::{AtomicU64, Ordering};

use axum::Router;
use axum::body::{Body, Bytes};
use axum::http::{HeaderMap, Method, Request, StatusCode};
use chrono::NaiveDate;
use daily_db::{InsertOutcome, PublicChallenge, insert_challenge, migrate};
use http_body_util::BodyExt;
use sqlx::postgres::PgPoolOptions;
use sqlx::{Executor, PgPool};
use tower::ServiceExt;

/// Keys that must never appear in a served puzzle.
pub const PRIVATE_KEYS: [&str; 8] = [
    "seed",
    "best",
    "bestScore",
    "best_score",
    "bestSolution",
    "botGoalRate",
    "botBestRate",
    "rules",
];

/// Seeds for the seven launch templates, in template order.
pub const SEEDS: [u64; 7] = [3, 5, 7, 11, 13, 17, 19];

static NEXT_SCHEMA: AtomicU64 = AtomicU64::new(1);

/// A migrated pool bound to a unique disposable schema.
struct TestDb {
    admin: PgPool,
    pool: PgPool,
    schema: String,
}

async fn drop_schema(admin: &PgPool, schema: &str) {
    sqlx::query(&format!("DROP SCHEMA IF EXISTS \"{schema}\" CASCADE"))
        .execute(admin)
        .await
        .expect("drop disposable test schema");
}

/// Creates a disposable migrated schema, dropping it again if setup fails,
/// or returns `None` when `DATABASE_URL` is unset.
async fn setup(test: &str) -> Option<TestDb> {
    let Ok(url) = std::env::var("DATABASE_URL") else {
        eprintln!("{test}: DATABASE_URL is not set, skipping the Postgres test");
        return None;
    };
    let seq = NEXT_SCHEMA.fetch_add(1, Ordering::Relaxed);
    let schema = format!("daily_server_test_{}_{seq}", std::process::id());
    let admin = daily_db::connect(&url)
        .await
        .expect("connect to DATABASE_URL");
    sqlx::query(&format!("CREATE SCHEMA \"{schema}\""))
        .execute(&admin)
        .await
        .expect("create disposable test schema");
    let schema_for_conn = schema.clone();
    let pool = match PgPoolOptions::new()
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
    {
        Ok(pool) => pool,
        Err(err) => {
            drop_schema(&admin, &schema).await;
            admin.close().await;
            panic!("connect pool to disposable test schema: {err}");
        }
    };
    if let Err(err) = migrate(&pool).await {
        pool.close().await;
        drop_schema(&admin, &schema).await;
        admin.close().await;
        panic!("migrate the disposable test schema: {err}");
    }
    Some(TestDb {
        admin,
        pool,
        schema,
    })
}

/// Runs `body` against a disposable schema and drops it even when `body` panics.
pub async fn with_test_db<F, Fut>(test: &str, body: F)
where
    F: FnOnce(PgPool) -> Fut + Send + 'static,
    Fut: std::future::Future<Output = ()> + Send + 'static,
{
    let Some(db) = setup(test).await else {
        return;
    };
    let result = tokio::spawn(body(db.pool.clone())).await;
    db.pool.close().await;
    drop_schema(&db.admin, &db.schema).await;
    db.admin.close().await;
    if let Err(err) = result {
        std::panic::resume_unwind(err.into_panic());
    }
}

/// Schedules each `(template index, day)` in `plan`, where the index follows
/// [`fixtures::TEMPLATE_IDS`], and returns the stored public views in order.
pub async fn schedule(pool: &PgPool, plan: &[(usize, NaiveDate)]) -> Vec<PublicChallenge> {
    let samples = fixtures::samples(SEEDS);
    let mut stored = Vec::new();
    for &(template, day) in plan {
        let puzzle = fixtures::new_puzzle(&samples[template], day);
        match insert_challenge(pool, &puzzle).await {
            Ok(InsertOutcome::Inserted(record)) => stored.push(record.to_public()),
            other => panic!(
                "test setup: insert {} on empty date {day}: expected Inserted, got {other:?}",
                fixtures::TEMPLATE_IDS[template]
            ),
        }
    }
    stored
}

/// What the router answered.
pub struct Reply {
    pub status: StatusCode,
    pub headers: HeaderMap,
    pub body: Bytes,
}

impl Reply {
    /// One header as text, or `""` when it is missing.
    pub fn header(&self, name: &str) -> String {
        self.headers
            .get(name)
            .map(|v| v.to_str().unwrap_or("<non-ASCII>").to_owned())
            .unwrap_or_default()
    }

    /// The body as text, for failure messages.
    pub fn text(&self) -> String {
        String::from_utf8_lossy(&self.body).into_owned()
    }

    /// The body parsed as JSON, panicking with `call` on failure.
    pub fn json(&self, call: &str) -> serde_json::Value {
        serde_json::from_slice(&self.body).unwrap_or_else(|e| {
            panic!(
                "{call}: body is not JSON ({e}), status {}, body {:?}",
                self.status,
                self.text()
            )
        })
    }
}

/// Sends one request with `headers` through `router` without a network.
pub async fn send(router: &Router, method: Method, uri: &str, headers: &[(&str, &str)]) -> Reply {
    let mut request = Request::builder().method(method.clone()).uri(uri);
    for &(name, value) in headers {
        request = request.header(name, value);
    }
    let request = request.body(Body::empty()).expect("build test request");
    let response = router
        .clone()
        .oneshot(request)
        .await
        .unwrap_or_else(|e| panic!("{method} {uri}: router returned an error: {e}"));
    let status = response.status();
    let headers = response.headers().clone();
    let body = response
        .into_body()
        .collect()
        .await
        .unwrap_or_else(|e| panic!("{method} {uri}: reading the body failed: {e}"))
        .to_bytes();
    Reply {
        status,
        headers,
        body,
    }
}

/// `GET uri` through `router`.
pub async fn get(router: &Router, uri: &str) -> Reply {
    send(router, Method::GET, uri, &[]).await
}
