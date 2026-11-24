//! Pure model tests: template mapping, scoring, `to_public`, and the JSON
//! that instances and solutions are stored as. No database needed.
//!
//! The JSON the server sends is pinned in `api/tests/bindings.rs`, and the
//! conversion to it in `server/tests/convert.rs`.

mod common;

use common::{Sample, TEMPLATE_IDS, date, samples};
use daily_challenges::linked_list_index_drift::Operation;
use daily_challenges::{
    avl_rotations, bst_forced_order, bubble, insertion_beats_merge, linked_list_index_drift,
    quicksort, upset_bst_beats_avl,
};
use daily_db::{
    ChallengeInstance, ChallengeSolution, DailyChallengeRecord, DbError, PublicChallenge,
};
use serde_json::json;

const SEEDS: [u64; 7] = [1, 2, 3, 4, 5, 6, 7];

#[rustfmt::skip]
fn from_cases() -> Vec<(ChallengeInstance, ChallengeInstance)> {
    let (v, f) = (|| vec![4, 1, 3, 2], || vec![0, 2]);
    vec![
        (quicksort::Instance { values: v(), fixed: f() }.into(), ChallengeInstance::Quicksort { values: v(), fixed: f() }),
        (bubble::Instance { values: v(), fixed: f(), target_passes: 3 }.into(), ChallengeInstance::Bubble { values: v(), fixed: f(), target_passes: 3 }),
        (insertion_beats_merge::Instance { values: v(), fixed: f() }.into(), ChallengeInstance::InsertionBeatsMerge { values: v(), fixed: f() }),
        (avl_rotations::Instance { values: v(), fixed: f() }.into(), ChallengeInstance::AvlRotations { values: v(), fixed: f() }),
        (bst_forced_order::Instance { values: vec![2, 1, 3], target_tree: vec![2, 1, 3] }.into(), ChallengeInstance::BstForcedOrder { values: vec![2, 1, 3], target_tree: vec![2, 1, 3] }),
        (upset_bst_beats_avl::Instance { values: v(), fixed: f() }.into(), ChallengeInstance::UpsetBstBeatsAvl { values: v(), fixed: f() }),
        (linked_list_index_drift::Instance { start: vec![1, 2], target: vec![2, 3] }.into(), ChallengeInstance::LinkedListIndexDrift { start: vec![1, 2], target: vec![2, 3] }),
    ]
}

#[test]
fn from_maps_every_template_instance_field_for_field() {
    for ((got, want), id) in from_cases().into_iter().zip(TEMPLATE_IDS) {
        assert_eq!(got, want, "From<{id} Instance> should map every field");
    }
}

#[test]
fn template_id_and_rules_match_daily_challenges() {
    for (sample, id) in samples(SEEDS).iter().zip(TEMPLATE_IDS) {
        assert_eq!(
            sample.instance.template_id(),
            id,
            "template_id() for {:?}",
            sample.instance
        );
        assert_eq!(
            sample.instance.rules(),
            sample.rules,
            "{id} seed {}: rules() should equal the template's own rules()",
            sample.seed
        );
    }
}

#[test]
fn score_solution_matches_template_solved_score() {
    let mut unsolved_seen = 0;
    for sample in samples(SEEDS) {
        let id = sample.template_id;
        assert!(
            sample.scored.iter().any(|(_, score)| score.is_some()),
            "{id} seed {}: fixture needs at least one solved candidate",
            sample.seed
        );
        for (solution, expected) in &sample.scored {
            let got = sample.instance.score_solution(solution);
            assert!(
                matches!(&got, Ok(score) if score == expected),
                "{id} seed {}: score_solution({solution:?}) = {got:?}, template solved_score = {expected:?}",
                sample.seed
            );
        }
        unsolved_seen += usize::from(sample.unsolved().is_some());
    }
    assert!(
        unsolved_seen > 0,
        "no template produced an unsolved (Ok(None)) candidate to check"
    );
}

#[test]
fn score_solution_returns_none_for_valid_unsolved_attempts() {
    let drift = ChallengeInstance::LinkedListIndexDrift {
        start: vec![1, 2],
        target: vec![2, 3],
    };
    let got = drift.score_solution(&ChallengeSolution::Operations(vec![]));
    assert!(
        matches!(got, Ok(None)),
        "index drift [1,2]->[2,3] with no operations: got {got:?}, want Ok(None)"
    );

    let forced = ChallengeInstance::BstForcedOrder {
        values: vec![2, 1, 3],
        target_tree: vec![2, 1, 3],
    };
    let got = forced.score_solution(&ChallengeSolution::Arrangement(vec![1, 2, 3]));
    assert!(
        matches!(got, Ok(None)),
        "forced order target [2,1,3] with insert order [1,2,3]: got {got:?}, want Ok(None)"
    );
    let got = forced.score_solution(&ChallengeSolution::Arrangement(vec![2, 1, 3]));
    assert!(
        matches!(got, Ok(Some(_))),
        "forced order target [2,1,3] with insert order [2,1,3]: got {got:?}, want Ok(Some(_))"
    );
}

#[test]
fn score_solution_rejects_the_wrong_solution_kind() {
    for sample in samples(SEEDS) {
        let wrong = match &sample.instance {
            ChallengeInstance::LinkedListIndexDrift { start, .. } => {
                ChallengeSolution::Arrangement(start.clone())
            }
            _ => ChallengeSolution::Operations(vec![Operation::Delete { index: 0 }]),
        };
        let got = sample.instance.score_solution(&wrong);
        assert!(
            matches!(got, Err(DbError::InvalidData(_))),
            "{}: score_solution({wrong:?}) = {got:?}, want Err(InvalidData)",
            sample.template_id
        );
    }
}

#[test]
fn score_solution_rejects_inputs_the_template_rejects() {
    for sample in samples(SEEDS) {
        let invalid = match &sample.instance {
            ChallengeInstance::LinkedListIndexDrift { .. } => {
                ChallengeSolution::Operations(vec![Operation::Delete { index: 999 }])
            }
            _ => ChallengeSolution::Arrangement(vec![i32::MIN]),
        };
        let got = sample.instance.score_solution(&invalid);
        assert!(
            matches!(got, Err(DbError::InvalidData(_))),
            "{}: score_solution({invalid:?}) should fail validation, got {got:?}",
            sample.template_id
        );
    }
}

/// A full record built from a real sample, with distinctive private values.
fn record(sample: &Sample, number: u32) -> DailyChallengeRecord {
    let (best_solution, best_score) = sample.solved();
    DailyChallengeRecord {
        challenge_date: date(2027, 2, 28),
        number,
        template_version: 3,
        instance: sample.instance.clone(),
        rules: sample.rules.clone(),
        seed: 9_876_543_210_123,
        goal: best_score.saturating_add(17),
        best_score,
        best_solution,
        bot_goal_rate: 0.375,
        bot_best_rate: 0.0625,
    }
}

#[test]
fn to_public_keeps_number_instance_goal_and_maps_challenge_date_to_date() {
    for (i, sample) in samples(SEEDS).iter().enumerate() {
        let record = record(sample, 40 + i as u32);
        let public = record.to_public();
        let want = PublicChallenge {
            number: record.number,
            instance: record.instance.clone(),
            goal: record.goal,
            date: record.challenge_date,
        };
        assert_eq!(
            public, want,
            "{}: to_public() of {record:?} should keep number, instance and goal, and set \
             date = challenge_date; expected {want:?}, got {public:?}",
            sample.template_id
        );
    }
}

#[test]
fn every_template_instance_round_trips_through_json() {
    for ((instance, _), id) in from_cases().into_iter().zip(TEMPLATE_IDS) {
        let text = serde_json::to_string(&instance).expect("ChallengeInstance serializes");
        let back: ChallengeInstance = serde_json::from_str(&text)
            .unwrap_or_else(|e| panic!("{id}: deserialize {text} into ChallengeInstance: {e}"));
        assert_eq!(
            back, instance,
            "{id}: ChallengeInstance round trip via {text}: expected {instance:?}, got {back:?}"
        );
    }
}

#[test]
fn challenge_solution_json_shape_and_round_trip() {
    let cases = [
        (
            ChallengeSolution::Arrangement(vec![3, -1, 2]),
            json!({"kind": "arrangement", "value": [3, -1, 2]}),
        ),
        (
            ChallengeSolution::Operations(vec![
                Operation::Insert { value: 5, index: 0 },
                Operation::Delete { index: 2 },
            ]),
            json!({"kind": "operations", "value": [
                {"kind": "insert", "value": 5, "index": 0},
                {"kind": "delete", "index": 2}
            ]}),
        ),
    ];
    for (solution, want) in cases {
        let got = serde_json::to_value(&solution).expect("ChallengeSolution serializes");
        assert_eq!(
            got, want,
            "serde_json::to_value({solution:?}): expected {want}, got {got}"
        );
        let back: ChallengeSolution = serde_json::from_value(got.clone())
            .unwrap_or_else(|e| panic!("deserialize {got} into ChallengeSolution: {e}"));
        assert_eq!(
            back, solution,
            "ChallengeSolution round trip via {got}: expected {solution:?}, got {back:?}"
        );
    }
}

#[test]
fn validate_shape_accepts_duplicate_bst_values_and_rejects_bad_shapes() {
    let dup_bst = ChallengeInstance::BstForcedOrder {
        values: vec![1, 2, 2, 3],
        target_tree: vec![1, 2, 3],
    };
    let got = dup_bst.validate_shape();
    assert!(
        got.is_ok(),
        "validate_shape() of {dup_bst:?} (duplicate values, distinct-key preorder): \
         expected Ok, got {got:?}"
    );

    let non_canonical = ChallengeInstance::BstForcedOrder {
        values: vec![1, 2, 3],
        target_tree: vec![2, 3, 1],
    };
    let got = non_canonical.validate_shape();
    assert!(
        matches!(got, Err(DbError::InvalidData(ref msg)) if msg.contains("targetTree")),
        "validate_shape() of {non_canonical:?} (not a BST preorder): expected \
         Err(InvalidData) naming targetTree, got {got:?}"
    );

    let rejected = [
        (
            "quicksort with no values",
            ChallengeInstance::Quicksort {
                values: vec![],
                fixed: vec![],
            },
        ),
        (
            "quicksort with fixed slot 2 of 2 values",
            ChallengeInstance::Quicksort {
                values: vec![1, 2],
                fixed: vec![2],
            },
        ),
    ];
    for (why, instance) in rejected {
        let got = instance.validate_shape();
        assert!(
            matches!(got, Err(DbError::InvalidData(_))),
            "validate_shape() of {instance:?} ({why}): expected Err(InvalidData), got {got:?}"
        );
    }
}
