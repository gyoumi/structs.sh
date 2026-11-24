//! `GET /api/daily` against Postgres. These tests run only when
//! `DATABASE_URL` is set, for example against
//! `docker compose -f docker-compose.daily-db.yml up`:
//! `DATABASE_URL=postgres://daily:daily@localhost:5432/daily_challenges`.
//! Each test creates and drops its own disposable schema, so scheduled rows
//! in `public.daily_challenges` are never touched.

mod common;

use std::io::{Read, Write};
use std::sync::Arc;

use axum::http::{Method, StatusCode};
use chrono::{DateTime, NaiveDate, Utc};
use common::fixtures::{TEMPLATE_IDS, date};
use common::{PRIVATE_KEYS, Reply, get, schedule, send, with_test_db};
use daily_api::{ApiError, DailyChallenge};
use daily_db::PublicChallenge;
use daily_server::{FixedClock, build_router, to_daily_challenge};

fn utc(text: &str) -> DateTime<Utc> {
    text.parse()
        .unwrap_or_else(|e| panic!("test instant {text:?} is not RFC 3339: {e}"))
}

/// Checks `reply` is a `200 OK`, uncached JSON copy of the stored `want`.
fn assert_serves(reply: &Reply, call: &str, want: &PublicChallenge) {
    assert_eq!(
        reply.status,
        StatusCode::OK,
        "{call}: expected status 200 for scheduled {}, got {} with body {:?}",
        want.date,
        reply.status,
        reply.text()
    );
    let content_type = reply.header("content-type");
    assert!(
        content_type.contains("application/json"),
        "{call}: content-type expected to contain application/json, got {content_type:?}"
    );
    let cache = reply.header("cache-control");
    assert!(
        cache.contains("no-store"),
        "{call}: cache-control expected to contain no-store, got {cache:?}"
    );
    let got = reply.json(call);
    let stored = serde_json::to_value(want).expect("serialize PublicChallenge");
    assert_eq!(
        got, stored,
        "{call}: expected the stored public puzzle for {} as JSON {stored}, got {got}",
        want.date
    );
    for key in PRIVATE_KEYS {
        assert!(
            got.get(key).is_none(),
            "{call}: private key {key:?} must not be served, got {got}"
        );
    }
    let parsed: DailyChallenge = serde_json::from_value(got.clone())
        .unwrap_or_else(|e| panic!("{call}: body {got} does not parse as DailyChallenge: {e}"));
    let expected = to_daily_challenge(want.clone());
    assert_eq!(
        parsed, expected,
        "{call}: parsed DailyChallenge expected {expected:?}, got {parsed:?}"
    );
}

/// The `date` field of a served puzzle, for short failure messages.
fn served_date(reply: &Reply, call: &str) -> String {
    reply.json(call)["date"]
        .as_str()
        .unwrap_or("<no date>")
        .to_owned()
}

/// The stored puzzle whose date is `day`.
fn on(stored: &[PublicChallenge], day: NaiveDate) -> &PublicChallenge {
    stored
        .iter()
        .find(|p| p.date == day)
        .unwrap_or_else(|| panic!("test setup: nothing was scheduled on {day}"))
}

#[tokio::test]
async fn todays_puzzle_comes_from_the_server() {
    with_test_db("todays_puzzle_comes_from_the_server", |pool| async move {
        let plan: Vec<(usize, NaiveDate)> =
            (0..7).map(|i| (i, date(2026, 12, 1 + i as u32))).collect();
        let stored = schedule(&pool, &plan).await;
        let clock = Arc::new(FixedClock::new(utc("2026-12-01T01:00:00Z")));
        let router = build_router(pool.clone(), clock.clone());
        for (want, (template, day)) in stored.iter().zip(&plan) {
            let instant = utc(&format!("{day}T01:00:00Z"));
            clock.set(instant);
            let call = format!(
                "GET /api/daily at {instant} (Sydney noon {day}, {} scheduled)",
                TEMPLATE_IDS[*template]
            );
            assert_serves(&get(&router, "/api/daily").await, &call, want);
        }
    })
    .await;
}

#[tokio::test]
async fn the_puzzle_changes_at_midnight_in_sydney() {
    with_test_db(
        "the_puzzle_changes_at_midnight_in_sydney",
        |pool| async move {
            let stored = schedule(
                &pool,
                &[
                    (0, date(2026, 7, 1)),
                    (1, date(2026, 7, 2)),
                    (4, date(2027, 1, 10)),
                    (6, date(2027, 1, 11)),
                ],
            )
            .await;
            let clock = Arc::new(FixedClock::new(utc("2026-07-01T13:59:59Z")));
            let router = build_router(pool.clone(), clock.clone());
            let steps = [
                (
                    "2026-07-01T13:59:59Z",
                    date(2026, 7, 1),
                    "AEST 23:59:59 on 1 July",
                ),
                (
                    "2026-07-01T14:00:00Z",
                    date(2026, 7, 2),
                    "AEST midnight, 1 second later",
                ),
                (
                    "2027-01-10T12:59:59Z",
                    date(2027, 1, 10),
                    "AEDT 23:59:59 on 10 January",
                ),
                (
                    "2027-01-10T13:00:00Z",
                    date(2027, 1, 11),
                    "AEDT midnight, 1 second later",
                ),
            ];
            for (instant, day, why) in steps {
                clock.set(utc(instant));
                let reply = get(&router, "/api/daily").await;
                let call = format!("GET /api/daily at {instant} [{why}]");
                assert_eq!(
                    reply.status,
                    StatusCode::OK,
                    "{call}: expected 200 with the {day} puzzle, got {} body {:?}",
                    reply.status,
                    reply.text()
                );
                let got = served_date(&reply, &call);
                assert_eq!(
                    got,
                    day.to_string(),
                    "{call}: expected the puzzle dated {day}, got one dated {got}"
                );
                assert_serves(&reply, &call, on(&stored, day));
            }
        },
    )
    .await;
}

#[tokio::test]
async fn the_client_cannot_skip_ahead_to_tomorrow() {
    with_test_db(
        "the_client_cannot_skip_ahead_to_tomorrow",
        |pool| async move {
            let stored = schedule(&pool, &[(2, date(2026, 7, 1)), (3, date(2026, 7, 2))]).await;
            let clock = Arc::new(FixedClock::new(utc("2026-07-01T13:59:59Z")));
            let router = build_router(pool.clone(), clock);
            let uri = "/api/daily?date=2026-07-02";
            let headers = [
                ("date", "Thu, 02 Jul 2026 05:00:00 GMT"),
                ("x-date", "2026-07-02"),
            ];
            let reply = send(&router, Method::GET, uri, &headers).await;
            let call = format!(
                "GET {uri} with headers {headers:?} while the server clock is 2026-07-01T13:59:59Z \
             (Sydney 2026-07-01 23:59:59)"
            );
            let got = if reply.status == StatusCode::OK {
                served_date(&reply, &call)
            } else {
                format!("status {}", reply.status)
            };
            assert_eq!(
                got, "2026-07-01",
                "{call}: expected the server's day 2026-07-01, got {got}"
            );
            assert_serves(&reply, &call, on(&stored, date(2026, 7, 1)));
        },
    )
    .await;
}

#[tokio::test]
async fn an_unscheduled_day_is_not_found() {
    with_test_db("an_unscheduled_day_is_not_found", |pool| async move {
        schedule(&pool, &[(5, date(2026, 7, 1))]).await;
        let instant = "2026-07-02T02:00:00Z";
        let router = build_router(pool.clone(), Arc::new(FixedClock::new(utc(instant))));
        let reply = get(&router, "/api/daily").await;
        let call = format!(
            "GET /api/daily at {instant} (Sydney 2026-07-02, only 2026-07-01 is scheduled)"
        );
        assert_eq!(
            reply.status,
            StatusCode::NOT_FOUND,
            "{call}: expected 404, got {} body {:?}",
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
        for key in ["template", "number", "values", "date"] {
            assert!(
                body.get(key).is_none(),
                "{call}: a 404 must not carry puzzle key {key:?}, got {body}"
            );
        }
    })
    .await;
}

/// Sends a raw HTTP/1.1 `GET` over a real TCP socket and returns the raw response.
fn http_get(addr: std::net::SocketAddr, path: &str) -> String {
    let mut stream = std::net::TcpStream::connect(addr)
        .unwrap_or_else(|e| panic!("connect to the served router at {addr}: {e}"));
    stream
        .set_read_timeout(Some(std::time::Duration::from_secs(10)))
        .expect("set read timeout");
    let request = format!("GET {path} HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\n\r\n");
    stream
        .write_all(request.as_bytes())
        .unwrap_or_else(|e| panic!("send GET {path} to {addr}: {e}"));
    let mut response = String::new();
    stream
        .read_to_string(&mut response)
        .unwrap_or_else(|e| panic!("read the response to GET {path} from {addr}: {e}"));
    response
}

#[tokio::test]
async fn a_real_http_client_gets_todays_puzzle_over_tcp() {
    with_test_db(
        "a_real_http_client_gets_todays_puzzle_over_tcp",
        |pool| async move {
            let stored = schedule(&pool, &[(1, date(2026, 7, 1))]).await;
            let router = build_router(
                pool.clone(),
                Arc::new(FixedClock::new(utc("2026-07-01T02:00:00Z"))),
            );
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
                .await
                .expect("bind 127.0.0.1:0");
            let addr = listener.local_addr().expect("listener address");
            let server = tokio::spawn(async move { axum::serve(listener, router).await });
            let raw = tokio::task::spawn_blocking(move || http_get(addr, "/api/daily"))
                .await
                .expect("HTTP client thread");
            server.abort();
            let call = format!("real TCP GET http://{addr}/api/daily at 2026-07-01T02:00:00Z");
            let (head, body) = raw
                .split_once("\r\n\r\n")
                .unwrap_or_else(|| panic!("{call}: no header/body separator in {raw:?}"));
            let status_line = head.lines().next().unwrap_or("");
            assert!(
                status_line.starts_with("HTTP/1.1 200"),
                "{call}: expected status line HTTP/1.1 200, got {status_line:?} (body {body:?})"
            );
            let head_lower = head.to_ascii_lowercase();
            for header in ["content-type: application/json", "cache-control: no-store"] {
                assert!(
                    head_lower.contains(header),
                    "{call}: expected header {header:?}, got headers {head:?}"
                );
            }
            let got: serde_json::Value = serde_json::from_str(body)
                .unwrap_or_else(|e| panic!("{call}: body {body:?} is not JSON: {e}"));
            let want = serde_json::to_value(&stored[0]).expect("serialize PublicChallenge");
            assert_eq!(
                got, want,
                "{call}: expected the stored 2026-07-01 puzzle {want}, got {got}"
            );
        },
    )
    .await;
}
