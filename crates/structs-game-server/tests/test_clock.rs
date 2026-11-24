//! The test-only clock control router (`build_test_clock_router`), which lets
//! the live-stack e2e suite move a [`FixedClock`] across Sydney midnight and
//! daylight saving changes, and the guarantees that keep it out of production:
//! `build_router` never mounts `/clock`, and the binary refuses
//! `STRUCTS_TEST_CLOCK_BIND` unless `STRUCTS_NOW` stops the clock.
//!
//! The Postgres test runs only when `DATABASE_URL` is set (see
//! `daily_api.rs`); the rest need no database.

mod common;

use std::process::Command;
use std::sync::Arc;
use std::time::Duration;

use axum::Router;
use axum::body::Body;
use axum::http::{Method, Request, StatusCode};
use chrono::{DateTime, Utc};
use common::fixtures::{TEMPLATE_IDS, date};
use common::{Reply, get, schedule, send, with_test_db};
use http_body_util::BodyExt;
use sqlx::postgres::PgPoolOptions;
use structs_game_api::ApiError;
use structs_game_server::{Clock, FixedClock, build_router, build_test_clock_router};
use tower::ServiceExt;

/// A DSN with a recognisable password that must never be printed.
const UNREACHABLE_DSN: &str = "postgres://leaky_user:s3cret-pa55word@127.0.0.1:1/structs_secret_db";

fn utc(text: &str) -> DateTime<Utc> {
    text.parse()
        .unwrap_or_else(|e| panic!("test instant {text:?} is not RFC 3339: {e}"))
}

/// Sends `method uri` with raw `body` bytes through `router` without a network.
async fn send_bytes(router: &Router, method: Method, uri: &str, body: Vec<u8>) -> Reply {
    let request = Request::builder()
        .method(method.clone())
        .uri(uri)
        .header("content-type", "application/json")
        .body(Body::from(body))
        .expect("build test request");
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

/// Sends `method uri` with a JSON `body` through `router` without a network.
async fn send_json(router: &Router, method: Method, uri: &str, body: &str) -> Reply {
    send_bytes(router, method, uri, body.as_bytes().to_vec()).await
}

/// `PUT /clock` with `{ "now": now }`.
async fn put_clock(router: &Router, now: &str) -> Reply {
    let body = serde_json::json!({ "now": now }).to_string();
    send_json(router, Method::PUT, "/clock", &body).await
}

/// Checks `reply` is a `200 OK`, uncached JSON clock reading of `want_now`
/// whose `sydneyDate` is `want_day`.
fn assert_clock_reply(reply: &Reply, call: &str, want_now: DateTime<Utc>, want_day: &str) {
    assert_eq!(
        reply.status,
        StatusCode::OK,
        "{call}: expected status 200, got {} with body {:?}",
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
    let body = reply.json(call);
    let now_text = body["now"].as_str().unwrap_or_else(|| {
        panic!("{call}: expected a string field \"now\" (RFC 3339), got body {body}")
    });
    let now = DateTime::parse_from_rfc3339(now_text).unwrap_or_else(|e| {
        panic!("{call}: \"now\" should be RFC 3339, got {now_text:?} ({e}); body {body}")
    });
    assert_eq!(
        now.with_timezone(&Utc),
        want_now,
        "{call}: \"now\" expected the instant {want_now}, got {now_text:?}; body {body}"
    );
    assert_eq!(
        body["sydneyDate"].as_str(),
        Some(want_day),
        "{call}: \"sydneyDate\" expected {want_day:?} (the Sydney calendar date at {want_now}), \
         got body {body}"
    );
}

/// Checks `reply` is a `400 Bad Request` uncached JSON [`ApiError`].
fn assert_bad_request(reply: &Reply, call: &str) {
    assert_eq!(
        reply.status,
        StatusCode::BAD_REQUEST,
        "{call}: expected 400 Bad Request, got {} with body {:?}",
        reply.status,
        reply.text()
    );
    let cache = reply.header("cache-control");
    assert!(
        cache.contains("no-store"),
        "{call}: cache-control expected to contain no-store, got {cache:?}"
    );
    let body = reply.json(call);
    let error: ApiError = serde_json::from_value(body.clone())
        .unwrap_or_else(|e| panic!("{call}: body {body} is not an ApiError {{ error }}: {e}"));
    assert!(
        !error.error.trim().is_empty(),
        "{call}: expected a non-empty ApiError.error, got {body}"
    );
}

#[tokio::test]
async fn get_clock_reads_the_fixed_clock_and_its_sydney_date() {
    let cases = [
        ("2026-10-03T13:59:59Z", "2026-10-03", "AEST 23:59:59"),
        ("2026-10-03T14:00:00Z", "2026-10-04", "AEST midnight"),
        (
            "2026-04-05T13:59:59Z",
            "2026-04-05",
            "AEST 23:59:59 after fall-back",
        ),
    ];
    for (instant, day, why) in cases {
        let router = build_test_clock_router(Arc::new(FixedClock::new(utc(instant))));
        let reply = get(&router, "/clock").await;
        let call = format!("GET /clock with FixedClock at {instant} [{why}]");
        assert_clock_reply(&reply, &call, utc(instant), day);
    }
}

#[tokio::test]
async fn put_clock_moves_the_shared_clock() {
    let clock = Arc::new(FixedClock::new(utc("2026-01-01T00:00:00Z")));
    let router = build_test_clock_router(clock.clone());
    let steps = [
        (
            "2026-10-04T12:59:59Z",
            "2026-10-04",
            "AEDT 23:59:59 on the 23-hour day",
        ),
        (
            "2026-10-04T13:00:00Z",
            "2026-10-05",
            "AEDT midnight, 1 second later",
        ),
        (
            "2026-04-05T14:00:00Z",
            "2026-04-06",
            "AEST midnight after the 25-hour day",
        ),
        (
            "2026-10-05T00:00:00+11:00",
            "2026-10-05",
            "an offset time, Sydney midnight",
        ),
    ];
    for (instant, day, why) in steps {
        let call = format!("PUT /clock {{\"now\":{instant:?}}} [{why}]");
        let reply = put_clock(&router, instant).await;
        assert_clock_reply(&reply, &call, utc(instant), day);
        assert_eq!(
            clock.now(),
            utc(instant),
            "{call}: the shared FixedClock should now read {instant}, got {}",
            clock.now()
        );
        let read = get(&router, "/clock").await;
        assert_clock_reply(
            &read,
            &format!("GET /clock after {call}"),
            utc(instant),
            day,
        );
    }
}

#[tokio::test]
async fn bad_put_clock_bodies_are_rejected_and_leave_the_clock_alone() {
    let start = utc("2026-10-03T01:00:00Z");
    let clock = Arc::new(FixedClock::new(start));
    let router = build_test_clock_router(clock.clone());
    let bodies = [
        ("not JSON at all", "invalid JSON"),
        ("{\"now\":", "truncated JSON"),
        ("{\"now\":\"not-a-time\"}", "a string that is not RFC 3339"),
        ("{\"now\":\"2026-10-03 14:00:00\"}", "a time with no offset"),
        ("{\"now\":\"2026-13-40T25:00:00Z\"}", "an impossible date"),
    ];
    for (body, why) in bodies {
        let call = format!("PUT /clock with body {body:?} ({why}) while the clock reads {start}");
        let reply = send_json(&router, Method::PUT, "/clock", body).await;
        assert_bad_request(&reply, &call);
        assert_eq!(
            clock.now(),
            start,
            "{call}: a rejected PUT must leave the clock at {start}, got {}",
            clock.now()
        );
        let read = get(&router, "/clock").await;
        assert_clock_reply(
            &read,
            &format!("GET /clock after {call}"),
            start,
            "2026-10-03",
        );
    }

    let invalid_utf8_call = format!("PUT /clock with non-UTF-8 bytes [0xff, 0xfe] at {start}");
    let reply = send_bytes(&router, Method::PUT, "/clock", vec![0xff, 0xfe]).await;
    assert_bad_request(&reply, &invalid_utf8_call);
    assert_eq!(
        clock.now(),
        start,
        "{invalid_utf8_call}: non-UTF-8 body must leave clock at {start}, got {}",
        clock.now()
    );
}

#[tokio::test]
async fn the_public_router_has_no_clock_control() {
    let pool = PgPoolOptions::new()
        .max_connections(1)
        .acquire_timeout(Duration::from_secs(3))
        .connect_lazy(UNREACHABLE_DSN)
        .expect("parse the unreachable test DSN");
    let start = utc("2026-10-03T01:00:00Z");
    let clock = Arc::new(FixedClock::new(start));
    let router = build_router(pool, clock.clone());
    let read = send(&router, Method::GET, "/clock", &[]).await;
    assert_eq!(
        read.status,
        StatusCode::NOT_FOUND,
        "GET /clock on build_router (the public server): expected 404 because clock control \
         lives only on build_test_clock_router, got {} with body {:?}",
        read.status,
        read.text()
    );
    let write = put_clock(&router, "2027-01-01T00:00:00Z").await;
    assert_eq!(
        write.status,
        StatusCode::NOT_FOUND,
        "PUT /clock {{\"now\":\"2027-01-01T00:00:00Z\"}} on build_router (the public server): \
         expected 404, got {} with body {:?}",
        write.status,
        write.text()
    );
    assert_eq!(
        clock.now(),
        start,
        "PUT /clock on build_router must not move the clock from {start}, got {}",
        clock.now()
    );
}

#[tokio::test]
async fn put_clock_changes_todays_puzzle_across_daylight_saving() {
    with_test_db(
        "put_clock_changes_todays_puzzle_across_daylight_saving",
        |pool| async move {
            // Template indexes follow TEMPLATE_IDS.
            let plan = [
                (0, date(2026, 10, 3)),
                (1, date(2026, 10, 4)),
                (3, date(2026, 10, 5)),
                (2, date(2026, 4, 4)),
                (5, date(2026, 4, 5)),
                (6, date(2026, 4, 6)),
            ];
            schedule(&pool, &plan).await;
            let clock = Arc::new(FixedClock::new(utc("2026-01-01T00:00:00Z")));
            let control = build_test_clock_router(clock.clone());
            let public = build_router(pool.clone(), clock);
            let steps = [
                (
                    "2026-10-03T13:59:59Z",
                    "2026-10-03",
                    "AEST 23:59:59 before spring-forward",
                ),
                (
                    "2026-10-03T14:00:00Z",
                    "2026-10-04",
                    "AEST midnight, the 23-hour day starts",
                ),
                (
                    "2026-10-04T12:59:59Z",
                    "2026-10-04",
                    "AEDT 23:59:59, 23 hours later",
                ),
                (
                    "2026-10-04T13:00:00Z",
                    "2026-10-05",
                    "AEDT midnight, 1 second later",
                ),
                (
                    "2026-04-04T12:59:59Z",
                    "2026-04-04",
                    "AEDT 23:59:59 before fall-back",
                ),
                (
                    "2026-04-04T13:00:00Z",
                    "2026-04-05",
                    "AEDT midnight, the 25-hour day starts",
                ),
                (
                    "2026-04-05T13:59:59Z",
                    "2026-04-05",
                    "AEST 23:59:59, 25 hours later",
                ),
                (
                    "2026-04-05T14:00:00Z",
                    "2026-04-06",
                    "AEST midnight, 1 second later",
                ),
            ];
            for (instant, day, why) in steps {
                let put = put_clock(&control, instant).await;
                assert_clock_reply(
                    &put,
                    &format!("PUT /clock {instant} [{why}]"),
                    utc(instant),
                    day,
                );
                let (template, _) = plan
                    .iter()
                    .find(|(_, d)| d.to_string() == day)
                    .unwrap_or_else(|| panic!("test setup: nothing scheduled on {day}"));
                let want_template = TEMPLATE_IDS[*template];
                let call = format!(
                    "GET /api/daily on build_router right after PUT /clock {instant} [{why}]"
                );
                let reply = get(&public, "/api/daily").await;
                assert_eq!(
                    reply.status,
                    StatusCode::OK,
                    "{call}: expected 200 with the {day} {want_template} puzzle, got {} body {:?}",
                    reply.status,
                    reply.text()
                );
                let body = reply.json(&call);
                assert_eq!(
                    (body["date"].as_str(), body["template"].as_str()),
                    (Some(day), Some(want_template)),
                    "{call}: expected (date, template) ({day}, {want_template}), got body {body}"
                );
            }
        },
    )
    .await;
}

#[test]
fn binary_refuses_clock_control_without_structs_now() {
    let bin = env!("CARGO_BIN_EXE_structs-game-server");
    for (now, why) in [
        (None, "STRUCTS_NOW unset"),
        (Some("   "), "STRUCTS_NOW blank"),
    ] {
        let mut command = Command::new(bin);
        command
            .env("DATABASE_URL", UNREACHABLE_DSN)
            .env("STRUCTS_TEST_CLOCK_BIND", "127.0.0.1:0")
            .env("BIND_ADDR", "127.0.0.1:0")
            .env_remove("STRUCTS_NOW");
        if let Some(now) = now {
            command.env("STRUCTS_NOW", now);
        }
        let output = command
            .output()
            .expect("run structs-game-server with STRUCTS_TEST_CLOCK_BIND");
        let call = format!(
            "structs-game-server with STRUCTS_TEST_CLOCK_BIND=127.0.0.1:0 and {why} \
             (clock control must never drive the real SystemClock)"
        );
        let out = format!(
            "{}{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
        assert!(
            !output.status.success(),
            "{call}: expected a non-zero exit, got {:?} with output {out:?}",
            output.status
        );
        assert!(
            out.contains("STRUCTS_TEST_CLOCK_BIND") && out.contains("STRUCTS_NOW"),
            "{call}: the error should name both STRUCTS_TEST_CLOCK_BIND and STRUCTS_NOW \
             (STRUCTS_TEST_CLOCK_BIND requires STRUCTS_NOW), got {out:?}"
        );
        for secret in ["s3cret-pa55word", "leaky_user"] {
            assert!(
                !out.contains(secret),
                "{call}: the startup error must not leak {secret:?} from DATABASE_URL, got {out:?}"
            );
        }
    }
}

#[test]
fn binary_healthcheck_follows_bind_addr() {
    use std::io::{Read, Write};
    use std::net::{TcpListener, TcpStream};
    use std::thread;

    // A mock `/healthz` on loopback that answers one connection: 200 for
    // `GET /healthz`, 404 for anything else.
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind mock healthz listener");
    let addr = listener.local_addr().expect("listener local addr");
    let port = addr.port();
    let handle = thread::spawn(move || {
        if let Ok((mut stream, _)) = listener.accept() {
            let mut req = Vec::new();
            let mut buf = [0u8; 256];
            while !req.windows(4).any(|w| w == b"\r\n\r\n") {
                match stream.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => req.extend_from_slice(&buf[..n]),
                }
            }
            let reply: &[u8] = if req.starts_with(b"GET /healthz ") {
                b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok"
            } else {
                b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
            };
            let _ = stream.write_all(reply);
        }
    });

    let bin = env!("CARGO_BIN_EXE_structs-game-server");
    let status = Command::new(bin)
        .arg("--healthcheck")
        .env("BIND_ADDR", format!("0.0.0.0:{port}"))
        .env("PORT", "1")
        .status()
        .expect("run structs-game-server --healthcheck");

    // If the probe went elsewhere, the mock is still waiting in `accept`:
    // wake it with a connection we close at once, so the join below can't
    // block. If the probe already came, the listener is closed (or about to
    // be) and this connect fails or goes unanswered, which is fine.
    drop(TcpStream::connect(addr));
    handle.join().expect("join mock healthz thread");

    assert!(
        status.success(),
        "--healthcheck with BIND_ADDR=0.0.0.0:{port} and PORT=1 should probe GET /healthz on 127.0.0.1:{port} (the wildcard BIND_ADDR on loopback, not PORT) and exit 0, got {status:?}"
    );
}
