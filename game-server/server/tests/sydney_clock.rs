//! The challenge calendar day in `Australia/Sydney` and the injectable
//! clocks. None of these tests need a database.
//!
//! The expected Sydney wall-clock times were checked against the IANA
//! database with Python's `zoneinfo` (`Australia/Sydney`).

mod common;

use std::sync::Arc;

use chrono::{NaiveDate, Utc};
use common::fixtures::date;
use common::utc;
use daily_server::{Clock, FixedClock, SystemClock, sydney_date};

/// Checks every `(UTC instant, expected Sydney date, why)` row.
fn check_days(rows: &[(&str, NaiveDate, &str)]) {
    for &(instant, want, why) in rows {
        let got = sydney_date(utc(instant));
        assert_eq!(
            got, want,
            "sydney_date({instant}) [{why}]: expected {want}, got {got}"
        );
    }
}

#[test]
fn standard_time_day_turns_over_at_1400_utc() {
    check_days(&[
        (
            "2026-07-01T00:00:00Z",
            date(2026, 7, 1),
            "AEST 10:00 on 1 July",
        ),
        (
            "2026-07-01T13:59:59Z",
            date(2026, 7, 1),
            "AEST 23:59:59, last second of 1 July",
        ),
        (
            "2026-07-01T14:00:00Z",
            date(2026, 7, 2),
            "AEST 00:00:00, first second of 2 July",
        ),
    ]);
}

#[test]
fn daylight_time_day_turns_over_at_1300_utc() {
    check_days(&[
        (
            "2027-01-10T12:59:59Z",
            date(2027, 1, 10),
            "AEDT 23:59:59, last second of 10 January",
        ),
        (
            "2027-01-10T13:00:00Z",
            date(2027, 1, 11),
            "AEDT 00:00:00, first second of 11 January",
        ),
        (
            "2027-01-10T23:30:00Z",
            date(2027, 1, 11),
            "AEDT 10:30 on 11 January while UTC is still 10 January",
        ),
    ]);
}

#[test]
fn spring_forward_day_lasts_23_hours() {
    check_days(&[
        (
            "2026-10-03T13:59:59Z",
            date(2026, 10, 3),
            "AEST 23:59:59 on Sat 3 October",
        ),
        (
            "2026-10-03T14:00:00Z",
            date(2026, 10, 4),
            "AEST 00:00:00, start of Sun 4 October",
        ),
        (
            "2026-10-03T15:59:59Z",
            date(2026, 10, 4),
            "AEST 01:59:59, just before clocks jump forward",
        ),
        (
            "2026-10-03T16:00:00Z",
            date(2026, 10, 4),
            "AEDT 03:00:00, just after clocks jump forward",
        ),
        (
            "2026-10-04T12:59:59Z",
            date(2026, 10, 4),
            "AEDT 23:59:59, last second of the 23-hour day",
        ),
        (
            "2026-10-04T13:00:00Z",
            date(2026, 10, 5),
            "AEDT 00:00:00, start of Mon 5 October",
        ),
    ]);
}

#[test]
fn fall_back_day_lasts_25_hours() {
    check_days(&[
        (
            "2027-04-03T12:59:59Z",
            date(2027, 4, 3),
            "AEDT 23:59:59 on Sat 3 April",
        ),
        (
            "2027-04-03T13:00:00Z",
            date(2027, 4, 4),
            "AEDT 00:00:00, start of Sun 4 April",
        ),
        (
            "2027-04-03T15:30:00Z",
            date(2027, 4, 4),
            "AEDT 02:30, first pass through the repeated hour",
        ),
        (
            "2027-04-03T16:30:00Z",
            date(2027, 4, 4),
            "AEST 02:30, second pass through the repeated hour",
        ),
        (
            "2027-04-04T13:59:59Z",
            date(2027, 4, 4),
            "AEST 23:59:59, last second of the 25-hour day",
        ),
        (
            "2027-04-04T14:00:00Z",
            date(2027, 4, 5),
            "AEST 00:00:00, start of Mon 5 April",
        ),
    ]);
}

#[test]
fn fixed_clock_returns_its_instant_until_set() {
    let start = utc("2026-07-01T13:59:59Z");
    let clock = FixedClock::new(start);
    assert_eq!(
        clock.now(),
        start,
        "FixedClock::new({start}).now(): expected {start}, got {}",
        clock.now()
    );
    assert_eq!(
        clock.now(),
        start,
        "FixedClock::new({start}).now() called twice: expected {start} again, got {}",
        clock.now()
    );
    let later = utc("2026-07-01T14:00:00Z");
    clock.set(later);
    assert_eq!(
        clock.now(),
        later,
        "FixedClock after set({later}).now(): expected {later}, got {}",
        clock.now()
    );
}

#[test]
fn fixed_clock_set_is_seen_through_a_shared_dyn_clock() {
    let start = utc("2027-01-10T12:59:59Z");
    let fixed = Arc::new(FixedClock::new(start));
    let shared: Arc<dyn Clock> = fixed.clone();
    let later = utc("2027-01-10T13:00:00Z");
    fixed.set(later);
    assert_eq!(
        shared.now(),
        later,
        "Arc<dyn Clock> sharing a FixedClock after set({later}): expected {later}, got {}",
        shared.now()
    );
}

#[test]
fn system_clock_reads_the_current_time() {
    let before = Utc::now();
    let now = SystemClock.now();
    let after = Utc::now();
    assert!(
        before <= now && now <= after,
        "SystemClock.now(): expected between {before} and {after}, got {now}"
    );
}
