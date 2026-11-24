//! Pure model tests: template mapping, scoring, and the JSON the browser
//! reads (`client/src/daily/puzzle.ts`). No database needed.

mod common;

use common::{Sample, TEMPLATE_IDS, date, samples};
use serde_json::{Value, json};
use structs_game_db::{DailyPuzzleRecord, DbError, PublicPuzzle, PuzzleInstance, PuzzleSolution};
use structs_puzzles::linked_list_index_drift::Operation;
use structs_puzzles::{
    avl_rotations, bst_forced_order, bubble, insertion_beats_merge, linked_list_index_drift,
    quicksort, upset_bst_beats_avl,
};

const SEEDS: [u64; 7] = [1, 2, 3, 4, 5, 6, 7];

/// Keys that hold answers or generation internals and must never reach the browser.
const PRIVATE_KEYS: [&str; 13] = [
    "best",
    "bestScore",
    "best_score",
    "bestSolution",
    "best_solution",
    "seed",
    "botGoalRate",
    "botBestRate",
    "bot_goal_rate",
    "bot_best_rate",
    "templateVersion",
    "template_version",
    "rules",
];

#[rustfmt::skip]
fn from_cases() -> Vec<(PuzzleInstance, PuzzleInstance)> {
    let (v, f) = (|| vec![4, 1, 3, 2], || vec![0, 2]);
    vec![
        (quicksort::Instance { values: v(), fixed: f() }.into(), PuzzleInstance::Quicksort { values: v(), fixed: f() }),
        (bubble::Instance { values: v(), fixed: f(), target_passes: 3 }.into(), PuzzleInstance::Bubble { values: v(), fixed: f(), target_passes: 3 }),
        (insertion_beats_merge::Instance { values: v(), fixed: f() }.into(), PuzzleInstance::InsertionBeatsMerge { values: v(), fixed: f() }),
        (avl_rotations::Instance { values: v(), fixed: f() }.into(), PuzzleInstance::AvlRotations { values: v(), fixed: f() }),
        (bst_forced_order::Instance { values: vec![2, 1, 3], target_tree: vec![2, 1, 3] }.into(), PuzzleInstance::BstForcedOrder { values: vec![2, 1, 3], target_tree: vec![2, 1, 3] }),
        (upset_bst_beats_avl::Instance { values: v(), fixed: f() }.into(), PuzzleInstance::UpsetBstBeatsAvl { values: v(), fixed: f() }),
        (linked_list_index_drift::Instance { start: vec![1, 2], target: vec![2, 3] }.into(), PuzzleInstance::LinkedListIndexDrift { start: vec![1, 2], target: vec![2, 3] }),
    ]
}

#[test]
fn from_maps_every_template_instance_field_for_field() {
    for ((got, want), id) in from_cases().into_iter().zip(TEMPLATE_IDS) {
        assert_eq!(got, want, "From<{id} Instance> should map every field");
    }
}

#[test]
fn template_id_and_rules_match_structs_puzzles() {
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
    let drift = PuzzleInstance::LinkedListIndexDrift {
        start: vec![1, 2],
        target: vec![2, 3],
    };
    let got = drift.score_solution(&PuzzleSolution::Operations(vec![]));
    assert!(
        matches!(got, Ok(None)),
        "index drift [1,2]->[2,3] with no operations: got {got:?}, want Ok(None)"
    );

    let forced = PuzzleInstance::BstForcedOrder {
        values: vec![2, 1, 3],
        target_tree: vec![2, 1, 3],
    };
    let got = forced.score_solution(&PuzzleSolution::Arrangement(vec![1, 2, 3]));
    assert!(
        matches!(got, Ok(None)),
        "forced order target [2,1,3] with insert order [1,2,3]: got {got:?}, want Ok(None)"
    );
    let got = forced.score_solution(&PuzzleSolution::Arrangement(vec![2, 1, 3]));
    assert!(
        matches!(got, Ok(Some(_))),
        "forced order target [2,1,3] with insert order [2,1,3]: got {got:?}, want Ok(Some(_))"
    );
}

#[test]
fn score_solution_rejects_the_wrong_solution_kind() {
    for sample in samples(SEEDS) {
        let wrong = match &sample.instance {
            PuzzleInstance::LinkedListIndexDrift { start, .. } => {
                PuzzleSolution::Arrangement(start.clone())
            }
            _ => PuzzleSolution::Operations(vec![Operation::Delete { index: 0 }]),
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
            PuzzleInstance::LinkedListIndexDrift { .. } => {
                PuzzleSolution::Operations(vec![Operation::Delete { index: 999 }])
            }
            _ => PuzzleSolution::Arrangement(vec![i32::MIN]),
        };
        let got = sample.instance.score_solution(&invalid);
        assert!(
            matches!(got, Err(DbError::InvalidData(_))),
            "{}: score_solution({invalid:?}) should fail validation, got {got:?}",
            sample.template_id
        );
    }
}

/// One public puzzle per template, with the exact JSON `parsePuzzle` accepts.
#[rustfmt::skip]
fn public_cases() -> Vec<(PublicPuzzle, Value)> {
    let public = |number, instance, par| PublicPuzzle { number, instance, par, date: date(2026, 11, 24) };
    vec![
        (public(1, PuzzleInstance::Quicksort { values: vec![5, 1, 4], fixed: vec![1] }, 6),
         json!({"number": 1, "template": "quicksort-most-comparisons", "values": [5, 1, 4], "fixed": [1], "par": 6, "date": "2026-11-24"})),
        (public(2, PuzzleInstance::Bubble { values: vec![3, 2, 1], fixed: vec![], target_passes: 2 }, 3),
         json!({"number": 2, "template": "bubble-exact-passes", "values": [3, 2, 1], "fixed": [], "targetPasses": 2, "par": 3, "date": "2026-11-24"})),
        (public(3, PuzzleInstance::InsertionBeatsMerge { values: vec![-2, 7], fixed: vec![0] }, 1),
         json!({"number": 3, "template": "insertion-beats-merge", "values": [-2, 7], "fixed": [0], "par": 1, "date": "2026-11-24"})),
        (public(4, PuzzleInstance::AvlRotations { values: vec![1, 2, 3], fixed: vec![2] }, 2),
         json!({"number": 4, "template": "avl-most-rotations", "values": [1, 2, 3], "fixed": [2], "par": 2, "date": "2026-11-24"})),
        (public(5, PuzzleInstance::BstForcedOrder { values: vec![1, 3, 2], target_tree: vec![2, 1, 3] }, 2),
         json!({"number": 5, "template": "bst-forced-order", "values": [1, 3, 2], "targetTree": [2, 1, 3], "par": 2, "date": "2026-11-24"})),
        (public(6, PuzzleInstance::UpsetBstBeatsAvl { values: vec![9, 8, 7], fixed: vec![0, 2] }, 4),
         json!({"number": 6, "template": "upset-bst-beats-avl", "values": [9, 8, 7], "fixed": [0, 2], "par": 4, "date": "2026-11-24"})),
        (public(7, PuzzleInstance::LinkedListIndexDrift { start: vec![1, 2, 3], target: vec![3, 4] }, 11),
         json!({"number": 7, "template": "linked-list-index-drift", "start": [1, 2, 3], "target": [3, 4], "par": 11, "date": "2026-11-24"})),
    ]
}

/// Every private key found anywhere in `value`, at any depth.
fn private_keys_in(value: &Value) -> Vec<String> {
    match value {
        Value::Object(map) => map
            .iter()
            .flat_map(|(key, inner)| {
                let own = PRIVATE_KEYS.contains(&key.as_str()).then(|| key.clone());
                own.into_iter().chain(private_keys_in(inner))
            })
            .collect(),
        Value::Array(items) => items.iter().flat_map(private_keys_in).collect(),
        _ => Vec::new(),
    }
}

#[test]
fn public_puzzle_json_matches_the_client_contract_exactly() {
    for (puzzle, want) in public_cases() {
        let got = serde_json::to_value(&puzzle).expect("PublicPuzzle serializes");
        assert_eq!(
            got,
            want,
            "PublicPuzzle JSON for {} (exact keys and values)",
            puzzle.instance.template_id()
        );
    }
}

#[test]
fn public_puzzle_json_omits_keys_the_client_rejects() {
    for (puzzle, _) in public_cases() {
        let got = serde_json::to_value(&puzzle).expect("PublicPuzzle serializes");
        let id = puzzle.instance.template_id();
        let has = |key: &str| got.get(key).is_some();
        match id {
            "bst-forced-order" => assert!(!has("fixed"), "{id} JSON must leave `fixed` out: {got}"),
            "linked-list-index-drift" => assert!(
                !has("values") && !has("fixed"),
                "{id} JSON must have no `values` or `fixed` (parseIndexDrift rejects them): {got}"
            ),
            _ => assert!(
                has("values") && has("fixed"),
                "{id} JSON needs `values` and `fixed`: {got}"
            ),
        }
    }
}

/// A full record built from a real sample, with distinctive private values.
fn record(sample: &Sample, number: u32) -> DailyPuzzleRecord {
    let (best_solution, best_score) = sample.solved();
    DailyPuzzleRecord {
        puzzle_date: date(2027, 2, 28),
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
fn to_public_maps_goal_to_par_and_puzzle_date_to_date() {
    for (i, sample) in samples(SEEDS).iter().enumerate() {
        let record = record(sample, 40 + i as u32);
        let public = record.to_public();
        let want = PublicPuzzle {
            number: record.number,
            instance: record.instance.clone(),
            par: record.goal,
            date: record.puzzle_date,
        };
        assert_eq!(
            public, want,
            "{}: to_public() should keep number/instance, par = goal, date = puzzle_date",
            sample.template_id
        );
    }
}

#[test]
fn to_public_json_never_leaks_private_fields() {
    for sample in samples(SEEDS) {
        let record = record(&sample, 1);
        let json = serde_json::to_value(record.to_public()).expect("PublicPuzzle serializes");
        let leaked = private_keys_in(&json);
        assert!(
            leaked.is_empty(),
            "{}: public JSON leaked {leaked:?}: {json}",
            sample.template_id
        );
        let text = json.to_string();
        assert!(
            !text.contains("9876543210123"),
            "{}: public JSON contains the seed: {text}",
            sample.template_id
        );
        assert_eq!(
            json["date"], "2027-02-28",
            "{}: date as YYYY-MM-DD",
            sample.template_id
        );
        assert_eq!(
            json["par"], record.goal,
            "{}: par is the goal",
            sample.template_id
        );
    }
}

#[test]
fn public_puzzle_and_instance_round_trip_through_json() {
    for (puzzle, _) in public_cases() {
        let text = serde_json::to_string(&puzzle).expect("PublicPuzzle serializes");
        let back: PublicPuzzle = serde_json::from_str(&text).expect("PublicPuzzle deserializes");
        assert_eq!(back, puzzle, "PublicPuzzle round trip via {text}");

        let text = serde_json::to_string(&puzzle.instance).expect("PuzzleInstance serializes");
        let back: PuzzleInstance =
            serde_json::from_str(&text).expect("PuzzleInstance deserializes");
        assert_eq!(
            back, puzzle.instance,
            "PuzzleInstance round trip via {text}"
        );
    }
}

#[test]
fn puzzle_solution_json_shape_and_round_trip() {
    let cases = [
        (
            PuzzleSolution::Arrangement(vec![3, -1, 2]),
            json!({"kind": "arrangement", "value": [3, -1, 2]}),
        ),
        (
            PuzzleSolution::Operations(vec![
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
        let got = serde_json::to_value(&solution).expect("PuzzleSolution serializes");
        assert_eq!(got, want, "PuzzleSolution JSON shape for {solution:?}");
        let back: PuzzleSolution =
            serde_json::from_value(got).expect("PuzzleSolution deserializes");
        assert_eq!(back, solution, "PuzzleSolution round trip");
    }
}

#[test]
fn validate_shape_accepts_duplicate_bst_values_and_rejects_bad_shapes() {
    let dup_bst = PuzzleInstance::BstForcedOrder {
        values: vec![1, 2, 2, 3],
        target_tree: vec![1, 2, 3],
    };
    assert!(
        dup_bst.validate_shape().is_ok(),
        "duplicate input values with valid distinct-key preorder match browser parser"
    );

    let non_canonical = PuzzleInstance::BstForcedOrder {
        values: vec![1, 2, 3],
        target_tree: vec![2, 3, 1],
    };
    let err = non_canonical
        .validate_shape()
        .expect_err("non-canonical preorder must fail validate_shape");
    assert!(
        matches!(err, DbError::InvalidData(ref msg) if msg.contains("targetTree")),
        "unexpected error: {err:?}"
    );

    let empty_qs = PuzzleInstance::Quicksort {
        values: vec![],
        fixed: vec![],
    };
    assert!(matches!(
        empty_qs.validate_shape(),
        Err(DbError::InvalidData(_))
    ));

    let bad_fixed = PuzzleInstance::Quicksort {
        values: vec![1, 2],
        fixed: vec![2],
    };
    assert!(matches!(
        bad_fixed.validate_shape(),
        Err(DbError::InvalidData(_))
    ));
}
