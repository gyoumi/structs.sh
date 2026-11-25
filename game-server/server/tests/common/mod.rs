//! Helpers shared by the `daily-server` integration tests: the `daily-db`
//! test helpers (a disposable migrated Postgres schema per test, real
//! template challenges, date parsers), scheduling challenges, and a
//! one-shot HTTP call against the router.
#![allow(dead_code)]

/// The `daily-db` test helpers, shared through `#[path]`.
#[path = "../../../db/tests/common/mod.rs"]
pub mod fixtures;

use axum::Router;
use axum::body::{Body, Bytes};
use axum::http::{HeaderMap, Method, Request, StatusCode};
use chrono::NaiveDate;
use daily_db::{InsertOutcome, PublicChallenge, insert_challenge};
use http_body_util::BodyExt;
use sqlx::PgPool;
use tower::ServiceExt;

// Not every test crate that includes this module uses every re-export.
#[allow(unused_imports)]
pub use fixtures::{PRIVATE_KEYS, utc, with_test_db};

/// Seeds for the seven launch templates, in template order.
pub const SEEDS: [u64; 7] = [3, 5, 7, 11, 13, 17, 19];

/// A DSN with a recognisable user, password and database that must never be
/// printed or served. Port 1 on loopback is closed, so it never connects.
pub const UNREACHABLE_DSN: &str =
    "postgres://leaky_user:s3cret-pa55word@127.0.0.1:1/structs_secret_db";

/// Schedules each `(template index, day)` in `plan`, where the index follows
/// [`fixtures::TEMPLATE_IDS`], and returns the stored public views in order.
pub async fn schedule(pool: &PgPool, plan: &[(usize, NaiveDate)]) -> Vec<PublicChallenge> {
    let samples = fixtures::samples(SEEDS);
    let mut stored = Vec::new();
    for &(template, day) in plan {
        let challenge = fixtures::new_challenge(&samples[template], day);
        match insert_challenge(pool, &challenge).await {
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

/// Sends one request with `headers` and an empty body through `router`
/// without a network.
pub async fn send(router: &Router, method: Method, uri: &str, headers: &[(&str, &str)]) -> Reply {
    send_body(router, method, uri, headers, Vec::new()).await
}

/// Sends one request with `headers` and raw `body` bytes through `router`
/// without a network.
pub async fn send_body(
    router: &Router,
    method: Method,
    uri: &str,
    headers: &[(&str, &str)],
    body: Vec<u8>,
) -> Reply {
    let mut request = Request::builder().method(method.clone()).uri(uri);
    for &(name, value) in headers {
        request = request.header(name, value);
    }
    let request = request.body(Body::from(body)).expect("build test request");
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
