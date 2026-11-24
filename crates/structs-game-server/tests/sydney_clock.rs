//! The puzzle calendar day in `Australia/Sydney`, the injectable clocks, and
//! the conversion from a stored `PublicPuzzle` to the HTTP `DailyPuzzle`.
//! None of these tests need a database.
//!
//! The expected Sydney wall-clock times were checked against the IANA
//! database with Python's `zoneinfo` (`Australia/Sydney`).

use std::sync::Arc;

use chrono::{DateTime, NaiveDate, Utc};
use structs_game_api::DailyPuzzle;
use structs_game_db::{PublicPuzzle, PuzzleInstance};
use structs_game_server::{Clock, FixedClock, SystemClock, sydney_date, to_daily_puzzle};

fn utc(text: &str) -> DateTime<Utc> {
    text.parse()
        .unwrap_or_else(|e| panic!("test instant {text:?} is not RFC 3339: {e}"))
}

fn date(y: i32, m: u32, d: u32) -> NaiveDate {
    NaiveDate::from_ymd_opt(y, m, d).expect("valid test date")
}

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

/// One stored public puzzle per template, paired with the HTTP puzzle it must become.
fn conversions() -> Vec<(PublicPuzzle, DailyPuzzle)> {
    let public = |number: u32, instance: PuzzleInstance, par: u32, day: NaiveDate| PublicPuzzle {
        number,
        instance,
        par,
        date: day,
    };
    vec![
        (
            public(
                1,
                PuzzleInstance::Quicksort {
                    values: vec![8, 1, 6, 3],
                    fixed: vec![1],
                },
                5,
                date(2026, 7, 1),
            ),
            DailyPuzzle::Quicksort {
                number: 1,
                values: vec![8, 1, 6, 3],
                fixed: vec![1],
                par: 5,
                date: date(2026, 7, 1),
            },
        ),
        (
            public(
                2,
                PuzzleInstance::Bubble {
                    values: vec![3, -1, 2],
                    fixed: vec![0, 2],
                    target_passes: 2,
                },
                2,
                date(2026, 7, 2),
            ),
            DailyPuzzle::Bubble {
                number: 2,
                values: vec![3, -1, 2],
                fixed: vec![0, 2],
                target_passes: 2,
                par: 2,
                date: date(2026, 7, 2),
            },
        ),
        (
            public(
                3,
                PuzzleInstance::InsertionBeatsMerge {
                    values: vec![4, 3, 2, 1],
                    fixed: vec![],
                },
                6,
                date(2026, 7, 3),
            ),
            DailyPuzzle::InsertionBeatsMerge {
                number: 3,
                values: vec![4, 3, 2, 1],
                fixed: vec![],
                par: 6,
                date: date(2026, 7, 3),
            },
        ),
        (
            public(
                4,
                PuzzleInstance::AvlRotations {
                    values: vec![10, 20, 30],
                    fixed: vec![2],
                },
                1,
                date(2026, 7, 4),
            ),
            DailyPuzzle::AvlRotations {
                number: 4,
                values: vec![10, 20, 30],
                fixed: vec![2],
                par: 1,
                date: date(2026, 7, 4),
            },
        ),
        (
            public(
                5,
                PuzzleInstance::BstForcedOrder {
                    values: vec![1, 2, 3],
                    target_tree: vec![2, 1, 3],
                },
                3,
                date(2026, 7, 5),
            ),
            DailyPuzzle::BstForcedOrder {
                number: 5,
                values: vec![1, 2, 3],
                target_tree: vec![2, 1, 3],
                par: 3,
                date: date(2026, 7, 5),
            },
        ),
        (
            public(
                6,
                PuzzleInstance::UpsetBstBeatsAvl {
                    values: vec![7, 3, 11],
                    fixed: vec![1],
                },
                2,
                date(2026, 7, 6),
            ),
            DailyPuzzle::UpsetBstBeatsAvl {
                number: 6,
                values: vec![7, 3, 11],
                fixed: vec![1],
                par: 2,
                date: date(2026, 7, 6),
            },
        ),
        (
            public(
                7,
                PuzzleInstance::LinkedListIndexDrift {
                    start: vec![1, 2, 3],
                    target: vec![3, 1],
                },
                4,
                date(2026, 7, 7),
            ),
            DailyPuzzle::LinkedListIndexDrift {
                number: 7,
                start: vec![1, 2, 3],
                target: vec![3, 1],
                par: 4,
                date: date(2026, 7, 7),
            },
        ),
    ]
}

#[test]
fn to_daily_puzzle_keeps_every_field_of_every_template() {
    for (public, want) in conversions() {
        let got = to_daily_puzzle(public.clone());
        assert_eq!(
            got, want,
            "to_daily_puzzle({public:?}): expected {want:?}, got {got:?}"
        );
    }
}

#[test]
fn to_daily_puzzle_serializes_like_the_stored_public_puzzle() {
    for (public, _) in conversions() {
        let stored_json = serde_json::to_value(&public).expect("serialize PublicPuzzle");
        let served = to_daily_puzzle(public.clone());
        let served_json = serde_json::to_value(&served).expect("serialize DailyPuzzle");
        assert_eq!(
            served_json, stored_json,
            "to_daily_puzzle({public:?}) as JSON: expected the PublicPuzzle JSON {stored_json}, \
             got {served_json}"
        );
    }
}
