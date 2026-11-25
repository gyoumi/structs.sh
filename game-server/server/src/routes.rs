//! The HTTP routes: `GET /api/daily` and `GET /healthz`.

use std::sync::Arc;

use axum::Json;
use axum::Router;
use axum::extract::State;
use axum::http::{HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use daily_api::ApiError;
use daily_db::describe_db_error;
use sqlx::PgPool;

use crate::clock::{Clock, sydney_date};
use crate::convert::to_daily_challenge;

/// The body sent when no challenge is scheduled for today.
const NOT_SCHEDULED: &str = "No challenge is scheduled for today.";

/// The body sent when the database could not be read.
const LOAD_FAILED: &str = "Failed to load today's challenge.";

/// What every handler reads.
#[derive(Clone)]
struct AppState {
    pool: PgPool,
    clock: Arc<dyn Clock>,
}

/// The server's routes. Today's challenge is picked by `clock`'s date in
/// Sydney, never by anything the request sends.
pub fn build_router(pool: PgPool, clock: Arc<dyn Clock>) -> Router {
    Router::new()
        .route("/api/daily", get(daily))
        .route("/healthz", get(healthz))
        .with_state(AppState { pool, clock })
}

/// `GET /api/daily`: today's public challenge, or a JSON error.
async fn daily(State(state): State<AppState>) -> Response {
    let today = sydney_date(state.clock.now());
    match daily_db::get_public_challenge_by_date(&state.pool, today).await {
        Ok(Some(challenge)) => no_store(StatusCode::OK, Json(to_daily_challenge(challenge))),
        Ok(None) => error(StatusCode::NOT_FOUND, NOT_SCHEDULED),
        Err(err) => {
            tracing::error!(%today, error = %describe_db_error(&err), "loading the daily challenge failed");
            error(StatusCode::INTERNAL_SERVER_ERROR, LOAD_FAILED)
        }
    }
}

/// `GET /healthz`: `ok` while the process is up.
async fn healthz() -> Response {
    no_store(StatusCode::OK, "ok")
}

/// A JSON [`ApiError`] response.
fn error(status: StatusCode, message: &str) -> Response {
    no_store(
        status,
        Json(ApiError {
            error: message.to_owned(),
        }),
    )
}

/// `body` with `status`, marked so nothing caches it past the day.
pub(crate) fn no_store(status: StatusCode, body: impl IntoResponse) -> Response {
    let mut response = (status, body).into_response();
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response
}
