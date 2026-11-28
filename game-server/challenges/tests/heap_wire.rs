mod common;

use common::heap::{describe, insert, op_text};
use daily_challenges::heap::{HeapOp, HeapOrder, HeapStep};
use serde_json::{Value, json};

// The JSON shape from docs/heap.md ("On the wire") at the serde level: HeapOp and HeapStep are
// tagged by a camelCase "kind" with camelCase fields and unknown fields rejected, and a missing
// CompareChildren right child is written as null. HeapOrder's strings, the HeapRunResult reply and
// the op and order rejections a request can hit are checked through `step_log_request` in
// wire_step_log_heap.rs; this file keeps what only the types show: serialising a HeapOp and
// reading HeapSteps back.

fn from_json<T: serde::de::DeserializeOwned>(what: &str, json: &Value) -> T {
    serde_json::from_value(json.clone())
        .unwrap_or_else(|e| panic!("{what}: deserialising {json} failed: {e}"))
}

fn to_json<T: serde::Serialize>(what: &str, value: &T) -> Value {
    serde_json::to_value(value).unwrap_or_else(|e| panic!("serialising a {what} failed: {e}"))
}

fn rejects<T: serde::de::DeserializeOwned + std::fmt::Debug>(what: &str, json: &Value, why: &str) {
    if let Ok(value) = serde_json::from_value::<T>(json.clone()) {
        panic!("{what} from {json}: should be rejected ({why}), got {value:?}");
    }
}

#[test]
fn heap_op_is_tagged_by_kind() {
    let cases = [
        (insert(5), json!({"kind": "insert", "key": 5})),
        (insert(-3), json!({"kind": "insert", "key": -3})),
        (HeapOp::Pop, json!({"kind": "pop"})),
        (HeapOp::Rebuild, json!({"kind": "rebuild"})),
    ];
    for (op, want) in cases {
        let what = op_text(&op);
        let got = to_json("HeapOp", &op);
        assert_eq!(got, want, "{what} as JSON should be {want}, got {got}");
        let back: HeapOp = from_json(&what, &want);
        let back = op_text(&back);
        assert_eq!(back, what, "{want} should read back as {what}, got {back}");
    }
}

#[test]
fn bad_heap_ops_are_rejected() {
    // An unknown field, a missing or string key and an unknown kind are checked on the wire in
    // wire_step_log_heap.rs.
    let cases = [
        (json!({"kind": "Insert", "key": 5}), "kinds are camelCase"),
        (json!({"key": 5}), "no kind"),
    ];
    for (json, why) in cases {
        rejects::<HeapOp>("HeapOp", &json, why);
    }
}

#[test]
fn every_heap_step_serialises_with_a_camel_case_kind() {
    let cases = [
        (
            HeapStep::Append { key: 8, index: 3 },
            json!({"kind": "append", "key": 8, "index": 3}),
        ),
        (
            HeapStep::CompareParent {
                index: 3,
                parent: 1,
                swap: true,
            },
            json!({"kind": "compareParent", "index": 3, "parent": 1, "swap": true}),
        ),
        (
            HeapStep::Swap {
                parent: 1,
                child: 3,
            },
            json!({"kind": "swap", "parent": 1, "child": 3}),
        ),
        (
            HeapStep::TakeRoot { key: 9 },
            json!({"kind": "takeRoot", "key": 9}),
        ),
        (
            HeapStep::MoveLastToRoot { key: 7, from: 2 },
            json!({"kind": "moveLastToRoot", "key": 7, "from": 2}),
        ),
        (
            HeapStep::CompareChildren {
                index: 0,
                left: 1,
                right: None,
                best: 1,
                swap: true,
            },
            json!({"kind": "compareChildren", "index": 0, "left": 1, "right": null, "best": 1, "swap": true}),
        ),
        (
            HeapStep::CompareChildren {
                index: 1,
                left: 3,
                right: Some(4),
                best: 4,
                swap: false,
            },
            json!({"kind": "compareChildren", "index": 1, "left": 3, "right": 4, "best": 4, "swap": false}),
        ),
        (
            HeapStep::StartRebuild {
                order: HeapOrder::Min,
            },
            json!({"kind": "startRebuild", "order": "min"}),
        ),
        (
            HeapStep::Reinserted { key: 3, index: 0 },
            json!({"kind": "reinserted", "key": 3, "index": 0}),
        ),
        (
            HeapStep::Settled { key: -8, index: 1 },
            json!({"kind": "settled", "key": -8, "index": 1}),
        ),
        (
            HeapStep::PoppedLast { key: 4 },
            json!({"kind": "poppedLast", "key": 4}),
        ),
        (HeapStep::Empty, json!({"kind": "empty"})),
        (
            HeapStep::HeapFull { key: 50 },
            json!({"kind": "heapFull", "key": 50}),
        ),
        (
            HeapStep::Rebuilt {
                order: HeapOrder::Max,
            },
            json!({"kind": "rebuilt", "order": "max"}),
        ),
    ];
    for (step, want) in cases {
        let what = describe(&step);
        let got = to_json("HeapStep", &step);
        assert_eq!(
            got, want,
            "{what} ({step:?}) as JSON should be {want}, got {got}"
        );
        let back: HeapStep = from_json(&what, &want);
        assert!(
            back == step,
            "{want} should read back as {step:?}, got {back:?}"
        );
    }
}

#[test]
fn compare_children_without_a_right_field_is_rejected() {
    // Every field of a variant with fields is required: a missing right child is written as
    // "right": null (read back as None in every_heap_step_serialises_with_a_camel_case_kind), so
    // leaving the key out is a malformed step, not None.
    let without =
        json!({"kind": "compareChildren", "index": 0, "left": 1, "best": 1, "swap": true});
    if let Ok(step) = serde_json::from_value::<HeapStep>(without.clone()) {
        panic!(
            "HeapStep from {without}: expected Err because the field right is missing (it must be \
             present, as null or a number), got Ok({step:?})"
        );
    }
}

#[test]
fn heap_steps_with_unknown_or_snake_case_fields_are_rejected() {
    let cases = [
        json!({"kind": "swap", "parent": 0, "child": 1, "line": 5}),
        json!({"kind": "settled", "key": 1, "index": 0, "order": "min"}),
        json!({"kind": "compareChildren", "index": 0, "left": 1, "right": null, "best": 1, "swap": true, "worse": 2}),
        json!({"kind": "move_last_to_root", "key": 7, "from": 2}),
        json!({"kind": "heapFull"}),
    ];
    for json in cases {
        rejects::<HeapStep>(
            "HeapStep",
            &json,
            "unknown field, snake_case kind or missing field",
        );
    }
}
