//! The JSON wire shape of every `DailyChallenge` and `ApiError`, and the
//! TypeScript bindings generated for `client/src/daily/api.ts`.
//!
//! To regenerate the committed bindings, run
//! `UPDATE_TS_BINDINGS=1 cargo test -p daily-api --test bindings`.

use std::path::PathBuf;

use chrono::NaiveDate;
use daily_api::{ApiError, DailyChallenge, render_ts_bindings, write_ts_bindings};
use serde_json::{Value, json};

/// Keys that would leak the answer or the puzzle's generation details.
const PRIVATE_KEYS: [&str; 8] = [
    "seed",
    "best",
    "bestScore",
    "best_score",
    "bestSolution",
    "botGoalRate",
    "botBestRate",
    "rules",
];

/// The seven launch template ids.
const TEMPLATE_IDS: [&str; 7] = [
    "quicksort-most-comparisons",
    "bubble-exact-passes",
    "insertion-beats-merge",
    "avl-most-rotations",
    "bst-forced-order",
    "upset-bst-beats-avl",
    "linked-list-index-drift",
];

fn date(y: i32, m: u32, d: u32) -> NaiveDate {
    NaiveDate::from_ymd_opt(y, m, d).expect("valid test date")
}

/// One puzzle per template, paired with the exact JSON object it must serialize to.
fn cases() -> Vec<(DailyChallenge, Value)> {
    vec![
        (
            DailyChallenge::Quicksort {
                number: 12,
                values: vec![8, 1, 6, 3, 2, 7, 4, 5],
                fixed: vec![1, 4, 6],
                goal: 34,
                date: date(2026, 7, 1),
            },
            json!({
                "template": "quicksort-most-comparisons",
                "number": 12,
                "values": [8, 1, 6, 3, 2, 7, 4, 5],
                "fixed": [1, 4, 6],
                "goal": 34,
                "date": "2026-07-01"
            }),
        ),
        (
            DailyChallenge::Bubble {
                number: 13,
                values: vec![5, -3, 9, 0],
                fixed: vec![0],
                target_passes: 2,
                goal: 2,
                date: date(2026, 7, 2),
            },
            json!({
                "template": "bubble-exact-passes",
                "number": 13,
                "values": [5, -3, 9, 0],
                "fixed": [0],
                "targetPasses": 2,
                "goal": 2,
                "date": "2026-07-02"
            }),
        ),
        (
            DailyChallenge::InsertionBeatsMerge {
                number: 14,
                values: vec![4, 3, 2, 1],
                fixed: vec![],
                goal: 6,
                date: date(2026, 7, 3),
            },
            json!({
                "template": "insertion-beats-merge",
                "number": 14,
                "values": [4, 3, 2, 1],
                "fixed": [],
                "goal": 6,
                "date": "2026-07-03"
            }),
        ),
        (
            DailyChallenge::AvlRotations {
                number: 15,
                values: vec![10, 20, 30, 40, 50],
                fixed: vec![2, 4],
                goal: 3,
                date: date(2026, 12, 31),
            },
            json!({
                "template": "avl-most-rotations",
                "number": 15,
                "values": [10, 20, 30, 40, 50],
                "fixed": [2, 4],
                "goal": 3,
                "date": "2026-12-31"
            }),
        ),
        (
            DailyChallenge::BstForcedOrder {
                number: 16,
                values: vec![1, 2, 3],
                target_tree: vec![2, 1, 3],
                goal: 3,
                date: date(2027, 1, 1),
            },
            json!({
                "template": "bst-forced-order",
                "number": 16,
                "values": [1, 2, 3],
                "targetTree": [2, 1, 3],
                "goal": 3,
                "date": "2027-01-01"
            }),
        ),
        (
            DailyChallenge::UpsetBstBeatsAvl {
                number: 17,
                values: vec![7, 3, 11, 1],
                fixed: vec![3],
                goal: 1,
                date: date(2027, 2, 28),
            },
            json!({
                "template": "upset-bst-beats-avl",
                "number": 17,
                "values": [7, 3, 11, 1],
                "fixed": [3],
                "goal": 1,
                "date": "2027-02-28"
            }),
        ),
        (
            DailyChallenge::LinkedListIndexDrift {
                number: 18,
                start: vec![1, 2, 3],
                target: vec![3, 1],
                goal: 4,
                date: date(2027, 3, 9),
            },
            json!({
                "template": "linked-list-index-drift",
                "number": 18,
                "start": [1, 2, 3],
                "target": [3, 1],
                "goal": 4,
                "date": "2027-03-09"
            }),
        ),
    ]
}

#[test]
fn every_template_serializes_to_its_exact_public_json() {
    let cases = cases();
    let templates: Vec<&str> = cases
        .iter()
        .map(|(_, want)| want["template"].as_str().unwrap_or("?"))
        .collect();
    assert_eq!(
        templates, TEMPLATE_IDS,
        "test fixture: expected one case per launch template, in order"
    );
    for (puzzle, want) in cases {
        let got = serde_json::to_value(&puzzle).expect("serialize DailyChallenge");
        assert_eq!(
            got, want,
            "serde_json::to_value({puzzle:?}): exact JSON object (keys, camelCase, \
             date as YYYY-MM-DD) expected {want}, got {got}"
        );
        let object = got
            .as_object()
            .expect("DailyChallenge serializes to an object");
        for key in PRIVATE_KEYS {
            assert!(
                !object.contains_key(key),
                "serde_json::to_value({puzzle:?}): private key {key:?} must be absent, got {got}"
            );
        }
    }
}

#[test]
fn tree_order_and_linked_list_puzzles_have_no_fixed_slots() {
    for (puzzle, _) in cases() {
        let got = serde_json::to_value(&puzzle).expect("serialize DailyChallenge");
        let template = got["template"].as_str().unwrap_or("?").to_owned();
        let has_fixed = got.get("fixed").is_some();
        let want_fixed = !matches!(
            template.as_str(),
            "bst-forced-order" | "linked-list-index-drift"
        );
        assert_eq!(
            has_fixed, want_fixed,
            "{template}: JSON key \"fixed\" present? expected {want_fixed}, got {has_fixed} in {got}"
        );
    }
}

#[test]
fn every_template_round_trips_through_json() {
    for (puzzle, want) in cases() {
        let text = serde_json::to_string(&puzzle).expect("serialize DailyChallenge");
        let back: DailyChallenge = serde_json::from_str(&text)
            .unwrap_or_else(|e| panic!("deserialize {text} back into DailyChallenge failed: {e}"));
        assert_eq!(
            back, puzzle,
            "round trip of {text}: expected {puzzle:?}, got {back:?}"
        );
        let from_wire: DailyChallenge = serde_json::from_value(want.clone()).unwrap_or_else(|e| {
            panic!("deserialize wire JSON {want} into DailyChallenge failed: {e}")
        });
        assert_eq!(
            from_wire, puzzle,
            "deserialize wire JSON {want}: expected {puzzle:?}, got {from_wire:?}"
        );
    }
}

#[test]
fn rejects_unknown_templates_and_snake_case_keys() {
    let rejected = [
        (
            "unknown template id",
            json!({"template": "heap-sort-most-swaps", "number": 1, "values": [1],
                   "fixed": [], "goal": 1, "date": "2026-07-01"}),
        ),
        (
            "bubble with snake_case target_passes",
            json!({"template": "bubble-exact-passes", "number": 1, "values": [2, 1],
                   "fixed": [], "target_passes": 1, "goal": 1, "date": "2026-07-01"}),
        ),
        (
            "bst-forced-order with snake_case target_tree",
            json!({"template": "bst-forced-order", "number": 1, "values": [1],
                   "target_tree": [1], "goal": 1, "date": "2026-07-01"}),
        ),
        (
            "quicksort with a date that is not YYYY-MM-DD",
            json!({"template": "quicksort-most-comparisons", "number": 1, "values": [1],
                   "fixed": [], "goal": 1, "date": "01/07/2026"}),
        ),
    ];
    for (label, input) in rejected {
        let got = serde_json::from_value::<DailyChallenge>(input.clone());
        assert!(
            got.is_err(),
            "deserialize DailyChallenge from {label} {input}: expected an error, got {got:?}"
        );
    }
}

#[test]
fn api_error_is_a_single_error_field_and_round_trips() {
    let error = ApiError {
        error: "no challenge is scheduled for 2026-07-01".to_owned(),
    };
    let got = serde_json::to_value(&error).expect("serialize ApiError");
    let want = json!({"error": "no challenge is scheduled for 2026-07-01"});
    assert_eq!(
        got, want,
        "serde_json::to_value({error:?}): expected {want}, got {got}"
    );
    let back: ApiError = serde_json::from_value(want.clone())
        .unwrap_or_else(|e| panic!("deserialize {want} into ApiError failed: {e}"));
    assert_eq!(
        back, error,
        "round trip of {want}: expected {error:?}, got {back:?}"
    );
}

#[test]
fn rendered_bindings_export_both_types_and_every_template() {
    let ts = render_ts_bindings();
    assert!(
        ts.trim_start().starts_with("/**"),
        "render_ts_bindings(): expected the file to start with a JSDoc banner \"/**\", \
         got first line {:?}",
        ts.lines().next()
    );
    for export in ["export type DailyChallenge", "export type ApiError"] {
        assert!(
            ts.contains(export),
            "render_ts_bindings(): expected {export:?} in the output, got:\n{ts}"
        );
    }
    for id in TEMPLATE_IDS {
        let literal = format!("\"{id}\"");
        assert!(
            ts.contains(&literal),
            "render_ts_bindings(): expected template literal {literal} in DailyChallenge, got:\n{ts}"
        );
    }
    for key in ["targetPasses", "targetTree", "date: string"] {
        assert!(
            ts.contains(key),
            "render_ts_bindings(): expected {key:?} in the generated types, got:\n{ts}"
        );
    }
    let plain_comments: Vec<(usize, &str)> = ts
        .lines()
        .enumerate()
        .filter(|(_, line)| line.trim_start().starts_with("//"))
        .map(|(i, line)| (i + 1, line))
        .collect();
    assert!(
        plain_comments.is_empty(),
        "render_ts_bindings(): expected no plain `//` comment lines (use JSDoc), \
         got (line number, text) {plain_comments:?}"
    );
}

/// `client/src/daily/api.ts`, found from this crate's manifest directory.
fn committed_bindings_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../client/src/daily/api.ts")
}

#[test]
fn committed_api_ts_matches_rendered_bindings() {
    let path = committed_bindings_path();
    if std::env::var_os("UPDATE_TS_BINDINGS").is_some() {
        write_ts_bindings(&path)
            .unwrap_or_else(|e| panic!("write_ts_bindings({}) failed: {e}", path.display()));
    }
    let rendered = render_ts_bindings();
    let committed = std::fs::read_to_string(&path).unwrap_or_else(|e| {
        panic!(
            "read committed bindings {}: {e}. Generate it with \
             `UPDATE_TS_BINDINGS=1 cargo test -p daily-api --test bindings`",
            path.display()
        )
    });
    assert!(
        committed == rendered,
        "{} differs from render_ts_bindings() byte for byte; regenerate it with \
         `UPDATE_TS_BINDINGS=1 cargo test -p daily-api --test bindings`.\n\
         --- committed ---\n{committed}\n--- rendered ---\n{rendered}",
        path.display()
    );
}

#[test]
fn write_ts_bindings_creates_parent_directories() {
    let root = std::env::temp_dir().join(format!("daily-api-bindings-{}", std::process::id()));
    let path = root.join("nested/game/api.ts");
    let _ = std::fs::remove_dir_all(&root);
    let result = write_ts_bindings(&path);
    let written = std::fs::read_to_string(&path);
    let _ = std::fs::remove_dir_all(&root);
    assert!(
        result.is_ok(),
        "write_ts_bindings({}) into a missing directory: expected Ok, got {result:?}",
        path.display()
    );
    let written = written.unwrap_or_else(|e| {
        panic!(
            "write_ts_bindings({}) returned Ok but the file is unreadable: {e}",
            path.display()
        )
    });
    assert!(
        written == render_ts_bindings(),
        "write_ts_bindings({}): file contents should equal render_ts_bindings(), got:\n{written}",
        path.display()
    );
}
