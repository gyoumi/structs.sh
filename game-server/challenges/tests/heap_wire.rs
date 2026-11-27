mod common;

use common::heap::{describe, insert, keys, name, op_text, run_ok};
use daily_challenges::heap::{HeapOp, HeapOrder, HeapStep};
use serde_json::{Value, json};

// The JSON shape from docs/heap.md ("On the wire"): HeapOrder is "min" or "max"; HeapOp and
// HeapStep are tagged by a camelCase "kind" with camelCase fields and unknown fields rejected;
// a missing CompareChildren right child is written as null; HeapRunResult is
// {"items", "steps", "comparisons", "swaps", "popped"} with popped null when nothing was popped.

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
fn heap_order_is_the_plain_string_min_or_max() {
    for (order, want) in [(HeapOrder::Min, "min"), (HeapOrder::Max, "max")] {
        let what = format!("HeapOrder::{}", name(&order));
        let got = to_json("HeapOrder", &order);
        assert_eq!(
            got,
            json!(want),
            "{what} as JSON should be {want:?}, got {got}"
        );
        let back: HeapOrder = from_json(&what, &json!(want));
        assert!(
            back == order,
            "{want:?} should read back as {what}, got HeapOrder::{}",
            name(&back)
        );
    }
    for bad in [json!("Min"), json!("MAX"), json!("ascending"), json!(0)] {
        rejects::<HeapOrder>("HeapOrder", &bad, "only \"min\" and \"max\" are orders");
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
    // Only variants with fields can reject extras: serde ignores extra keys on tagged unit
    // variants such as {"kind": "pop"}.
    let cases = [
        (
            json!({"kind": "insert", "key": 5, "value": 1}),
            "unknown field value",
        ),
        (json!({"kind": "insert"}), "insert needs a key"),
        (json!({"kind": "insert", "key": "5"}), "the key is a number"),
        (json!({"kind": "Insert", "key": 5}), "kinds are camelCase"),
        (json!({"kind": "push", "key": 5}), "unknown kind push"),
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

#[test]
fn run_results_serialise_as_camel_case_json() {
    // The logs follow docs/heap.md's "Exact step order"; heap_pop.rs, heap_insert.rs and
    // heap_rebuild.rs check the same runs step by step.
    let cases = [
        (
            HeapOrder::Max,
            "[9 5 7]",
            HeapOp::Pop,
            json!({"items": [7, 5], "comparisons": 1, "swaps": 0, "popped": 9, "steps": [
            {"kind": "takeRoot", "key": 9},
            {"kind": "moveLastToRoot", "key": 7, "from": 2},
            {"kind": "compareChildren", "index": 0, "left": 1, "right": null, "best": 1, "swap": false},
            {"kind": "settled", "key": 7, "index": 0}]}),
        ),
        (
            HeapOrder::Min,
            "[1 5 3 7]",
            insert(2),
            json!({"items": [1, 2, 3, 7, 5], "comparisons": 2, "swaps": 1, "popped": null, "steps": [
            {"kind": "append", "key": 2, "index": 4},
            {"kind": "compareParent", "index": 4, "parent": 1, "swap": true},
            {"kind": "swap", "parent": 1, "child": 4},
            {"kind": "compareParent", "index": 1, "parent": 0, "swap": false},
            {"kind": "settled", "key": 2, "index": 1}]}),
        ),
        (
            HeapOrder::Min,
            "[]",
            HeapOp::Pop,
            json!({"items": [], "comparisons": 0, "swaps": 0, "popped": null, "steps": [{"kind": "empty"}]}),
        ),
        (
            HeapOrder::Max,
            "[4]",
            HeapOp::Pop,
            json!({"items": [], "comparisons": 0, "swaps": 0, "popped": 4, "steps": [
            {"kind": "takeRoot", "key": 4}, {"kind": "poppedLast", "key": 4}]}),
        ),
        (
            HeapOrder::Max,
            "[1 4]",
            HeapOp::Rebuild,
            json!({"items": [4, 1], "comparisons": 1, "swaps": 1, "popped": null, "steps": [
            {"kind": "startRebuild", "order": "max"},
            {"kind": "append", "key": 1, "index": 0},
            {"kind": "reinserted", "key": 1, "index": 0},
            {"kind": "append", "key": 4, "index": 1},
            {"kind": "compareParent", "index": 1, "parent": 0, "swap": true},
            {"kind": "swap", "parent": 0, "child": 1},
            {"kind": "reinserted", "key": 4, "index": 0},
            {"kind": "rebuilt", "order": "max"}]}),
        ),
    ];
    for (order, items, op, want) in cases {
        let (ctx, result) = run_ok(&order, 15, &keys(items), &op);
        let got = to_json("HeapRunResult", &result);
        let mut fields: Vec<&str> = got
            .as_object()
            .map(|o| o.keys().map(String::as_str).collect())
            .unwrap_or_default();
        fields.sort_unstable();
        let expected_fields = ["comparisons", "items", "popped", "steps", "swaps"];
        assert_eq!(
            fields, expected_fields,
            "{ctx}: HeapRunResult JSON should have exactly the fields {expected_fields:?}, got {fields:?} in {got}"
        );
        assert_eq!(
            got, want,
            "{ctx}: HeapRunResult JSON should be\n  {want}\ngot\n  {got}"
        );
    }
}
