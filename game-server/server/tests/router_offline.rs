//! Router behaviour that needs no running database: the read-only methods,
//! the health check, and the error when Postgres can't be reached. The pool
//! points at a closed local port, so it never connects. The binary's own
//! startup checks are in `binary.rs`.

mod common;

use std::sync::Arc;
use std::time::Duration;

use axum::Router;
use axum::http::{Method, StatusCode};
use common::{UNREACHABLE_DSN, get, send};
use daily_api::ApiError;
use daily_server::{FixedClock, build_router};
use sqlx::postgres::PgPoolOptions;

/// A router whose pool can never connect.
fn offline_router() -> Router {
    let pool = PgPoolOptions::new()
        .max_connections(1)
        .acquire_timeout(Duration::from_secs(3))
        .connect_lazy(UNREACHABLE_DSN)
        .expect("parse the unreachable test DSN");
    let now = "2026-07-01T02:00:00Z".parse().expect("valid test instant");
    build_router(pool, Arc::new(FixedClock::new(now)))
}

#[tokio::test]
async fn writes_to_api_daily_are_method_not_allowed() {
    let router = offline_router();
    for method in [Method::POST, Method::PUT, Method::DELETE, Method::PATCH] {
        let reply = send(&router, method.clone(), "/api/daily", &[]).await;
        assert_eq!(
            reply.status,
            StatusCode::METHOD_NOT_ALLOWED,
            "{method} /api/daily: expected 405 (the server only reads), got {} body {:?}",
            reply.status,
            reply.text()
        );
    }
}

#[tokio::test]
async fn healthz_says_ok_without_caching() {
    let router = offline_router();
    let reply = get(&router, "/healthz").await;
    assert_eq!(
        reply.status,
        StatusCode::OK,
        "GET /healthz: expected 200, got {} body {:?}",
        reply.status,
        reply.text()
    );
    assert_eq!(
        reply.text(),
        "ok",
        "GET /healthz: expected body \"ok\", got {:?}",
        reply.text()
    );
    let cache = reply.header("cache-control");
    assert!(
        cache.contains("no-store"),
        "GET /healthz: cache-control expected to contain no-store, got {cache:?}"
    );
}

#[tokio::test]
async fn database_failure_is_a_500_that_leaks_no_secrets() {
    let router = offline_router();
    let reply = get(&router, "/api/daily").await;
    let call = format!("GET /api/daily with the pool pointed at unreachable {UNREACHABLE_DSN}");
    assert_eq!(
        reply.status,
        StatusCode::INTERNAL_SERVER_ERROR,
        "{call}: expected 500, got {} body {:?}",
        reply.status,
        reply.text()
    );
    let cache = reply.header("cache-control");
    assert!(
        cache.contains("no-store"),
        "{call}: cache-control expected to contain no-store, got {cache:?}"
    );
    let content_type = reply.header("content-type");
    assert!(
        content_type.contains("application/json"),
        "{call}: content-type expected to contain application/json, got {content_type:?}"
    );
    let body = reply.json(&call);
    let error: ApiError = serde_json::from_value(body.clone())
        .unwrap_or_else(|e| panic!("{call}: body {body} is not an ApiError: {e}"));
    assert!(
        !error.error.trim().is_empty(),
        "{call}: expected a non-empty ApiError.error, got {body}"
    );
    let text = reply.text();
    for secret in [
        "s3cret-pa55word",
        "leaky_user",
        "structs_secret_db",
        "postgres://",
        "127.0.0.1:1",
    ] {
        assert!(
            !text.contains(secret),
            "{call}: the 500 body must not leak {secret:?} from the DSN, got {text:?}"
        );
    }
}
