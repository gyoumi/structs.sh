//! The test-only clock control: `GET /clock` and `PUT /clock`.
//!
//! [`build_test_clock_router`] lets end-to-end tests read and move a
//! [`FixedClock`]. It is served on its own listener, never by
//! [`build_router`](crate::build_router), so players can't reach it.

use std::sync::Arc;

use axum::Json;
use axum::Router;
use axum::body::Bytes;
use axum::extract::State;
use axum::extract::rejection::BytesRejection;
use axum::http::{HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use chrono::{DateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use structs_game_api::ApiError;

use crate::clock::{Clock, FixedClock, sydney_date};

/// The body `PUT /clock` takes.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SetClock {
    /// The new time, in RFC 3339.
    now: String,
}

/// The body both routes return: the clock's time and its Sydney date.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ClockState {
    /// The clock's time in RFC 3339, in UTC.
    now: String,
    /// The calendar date in Sydney at that time, as `YYYY-MM-DD`.
    sydney_date: String,
}

/// The routes that read and move `clock`.
pub fn build_test_clock_router(clock: Arc<FixedClock>) -> Router {
    Router::new()
        .route("/clock", get(read_clock).put(set_clock))
        .with_state(clock)
}

/// `GET /clock`: the clock's current time.
async fn read_clock(State(clock): State<Arc<FixedClock>>) -> Response {
    clock_state(clock.now())
}

/// `PUT /clock`: moves the clock to the body's `now`, or leaves it alone
/// and answers 400 when the body is not `{ "now": "<RFC 3339>" }`.
async fn set_clock(
    State(clock): State<Arc<FixedClock>>,
    body: Result<Bytes, BytesRejection>,
) -> Response {
    let body = match body {
        Ok(body) => body,
        Err(err) => {
            return bad_request(format!("Couldn't read request body: {err}"));
        }
    };
    let request: SetClock = match serde_json::from_slice(&body) {
        Ok(request) => request,
        Err(err) => {
            return bad_request(format!(
                "Expected a JSON body {{\"now\": \"<RFC 3339 time>\"}}: {err}"
            ));
        }
    };
    let now = match DateTime::parse_from_rfc3339(&request.now) {
        Ok(now) => now.with_timezone(&Utc),
        Err(err) => {
            return bad_request(format!("now must be an RFC 3339 time: {err}"));
        }
    };
    clock.set(now);
    clock_state(now)
}

/// A `200 OK` describing `now`.
fn clock_state(now: DateTime<Utc>) -> Response {
    no_store(
        StatusCode::OK,
        Json(ClockState {
            now: now.to_rfc3339_opts(SecondsFormat::AutoSi, true),
            sydney_date: sydney_date(now).format("%Y-%m-%d").to_string(),
        }),
    )
}

/// A `400 Bad Request` with `message` as its [`ApiError`].
fn bad_request(message: String) -> Response {
    no_store(StatusCode::BAD_REQUEST, Json(ApiError { error: message }))
}

/// `body` with `status`, marked so nothing caches it.
fn no_store(status: StatusCode, body: impl IntoResponse) -> Response {
    let mut response = (status, body).into_response();
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response
}
