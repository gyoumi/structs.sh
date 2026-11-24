//! The conversion from a stored `PublicChallenge` to the `DailyChallenge` the
//! server sends. The JSON of `DailyChallenge` itself is pinned in
//! `api/tests/bindings.rs`. No database needed.

mod common;

use chrono::NaiveDate;
use common::fixtures::date;
use daily_api::DailyChallenge;
use daily_db::{ChallengeInstance, PublicChallenge};
use daily_server::to_daily_challenge;

/// One stored public challenge per template, paired with the served
/// `DailyChallenge` it must become.
fn conversions() -> Vec<(PublicChallenge, DailyChallenge)> {
    let public =
        |number: u32, instance: ChallengeInstance, goal: u32, day: NaiveDate| PublicChallenge {
            number,
            instance,
            goal,
            date: day,
        };
    vec![
        (
            public(
                1,
                ChallengeInstance::Quicksort {
                    values: vec![8, 1, 6, 3],
                    fixed: vec![1],
                },
                5,
                date(2026, 7, 1),
            ),
            DailyChallenge::Quicksort {
                number: 1,
                values: vec![8, 1, 6, 3],
                fixed: vec![1],
                goal: 5,
                date: date(2026, 7, 1),
            },
        ),
        (
            public(
                2,
                ChallengeInstance::Bubble {
                    values: vec![3, -1, 2],
                    fixed: vec![0, 2],
                    target_passes: 2,
                },
                2,
                date(2026, 7, 2),
            ),
            DailyChallenge::Bubble {
                number: 2,
                values: vec![3, -1, 2],
                fixed: vec![0, 2],
                target_passes: 2,
                goal: 2,
                date: date(2026, 7, 2),
            },
        ),
        (
            public(
                3,
                ChallengeInstance::InsertionBeatsMerge {
                    values: vec![4, 3, 2, 1],
                    fixed: vec![],
                },
                6,
                date(2026, 7, 3),
            ),
            DailyChallenge::InsertionBeatsMerge {
                number: 3,
                values: vec![4, 3, 2, 1],
                fixed: vec![],
                goal: 6,
                date: date(2026, 7, 3),
            },
        ),
        (
            public(
                4,
                ChallengeInstance::AvlRotations {
                    values: vec![10, 20, 30],
                    fixed: vec![2],
                },
                1,
                date(2026, 7, 4),
            ),
            DailyChallenge::AvlRotations {
                number: 4,
                values: vec![10, 20, 30],
                fixed: vec![2],
                goal: 1,
                date: date(2026, 7, 4),
            },
        ),
        (
            public(
                5,
                ChallengeInstance::BstForcedOrder {
                    values: vec![1, 2, 3],
                    target_tree: vec![2, 1, 3],
                },
                3,
                date(2026, 7, 5),
            ),
            DailyChallenge::BstForcedOrder {
                number: 5,
                values: vec![1, 2, 3],
                target_tree: vec![2, 1, 3],
                goal: 3,
                date: date(2026, 7, 5),
            },
        ),
        (
            public(
                6,
                ChallengeInstance::UpsetBstBeatsAvl {
                    values: vec![7, 3, 11],
                    fixed: vec![1],
                },
                2,
                date(2026, 7, 6),
            ),
            DailyChallenge::UpsetBstBeatsAvl {
                number: 6,
                values: vec![7, 3, 11],
                fixed: vec![1],
                goal: 2,
                date: date(2026, 7, 6),
            },
        ),
        (
            public(
                7,
                ChallengeInstance::LinkedListIndexDrift {
                    start: vec![1, 2, 3],
                    target: vec![3, 1],
                },
                4,
                date(2026, 7, 7),
            ),
            DailyChallenge::LinkedListIndexDrift {
                number: 7,
                start: vec![1, 2, 3],
                target: vec![3, 1],
                goal: 4,
                date: date(2026, 7, 7),
            },
        ),
    ]
}

#[test]
fn to_daily_challenge_keeps_every_field_of_every_template() {
    for (public, want) in conversions() {
        let got = to_daily_challenge(public.clone());
        assert_eq!(
            got, want,
            "to_daily_challenge({public:?}): expected {want:?}, got {got:?}"
        );
    }
}
