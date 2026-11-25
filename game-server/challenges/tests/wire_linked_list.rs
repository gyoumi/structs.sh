use daily_challenges::wire::score_request;
use serde_json::{Value, json};

// Wire JSON for `linked-list-index-drift`. Counts match challenge #26 (DRIFT_26) in
// `e2e/support/daily-list-fixtures.ts`: insert(v, i) walks min(i, length before),
// delete(i) walks i + 1, cost = operations + nodes walked.

const DRIFT: &str = "linked-list-index-drift";

const OTHER_TEMPLATES: [&str; 6] = [
    "quicksort-most-comparisons",
    "bubble-exact-passes",
    "insertion-beats-merge",
    "avl-most-rotations",
    "bst-forced-order",
    "upset-bst-beats-avl",
];

fn bytes(request: &Value) -> Vec<u8> {
    request.to_string().into_bytes()
}

fn assert_reply(request: &Value, expected: Value, behaviour: &str) {
    let reply = score_request(&bytes(request)).unwrap_or_else(|message| {
        panic!("score_request({request}) should succeed ({behaviour}), got Err({message:?})")
    });
    let reply: Value = serde_json::from_str(&reply).unwrap_or_else(|error| {
        panic!("score_request({request}) reply {reply:?} should be JSON: {error}")
    });
    assert_eq!(
        reply, expected,
        "score_request({request}): {behaviour}; expected {expected}, got {reply}"
    );
}

/// The request must fail with a non-empty message containing `needle` (ignoring case).
fn assert_rejected(request: &Value, needle: &str, behaviour: &str) {
    let reply = score_request(&bytes(request));
    let message = reply.clone().err().unwrap_or_default();
    assert!(
        reply.is_err()
            && !message.trim().is_empty()
            && message.to_lowercase().contains(&needle.to_lowercase()),
        "score_request({request}): {behaviour}, with a message naming {needle:?}; got {reply:?}"
    );
}

fn drift(operations: Value) -> Value {
    json!({
        "template": DRIFT,
        "start": [8, 3, 6, 1],
        "target": [3, 6, 5, 1],
        "operations": operations,
    })
}

fn cheap() -> Value {
    drift(json!([
        {"kind": "delete", "index": 0},
        {"kind": "insert", "value": 5, "index": 2},
    ]))
}

fn with(mut request: Value, field: &str, value: Value) -> Value {
    request[field] = value;
    request
}

fn without(mut request: Value, field: &str) -> Value {
    if let Some(object) = request.as_object_mut() {
        object.remove(field);
    }
    request
}

fn reply(solved: bool, operations: u32, walked: u32) -> Value {
    let cost = operations + walked;
    let score = if solved { json!(cost) } else { Value::Null };
    json!({
        "solved": solved,
        "score": score,
        "operations": operations,
        "nodesWalked": walked,
        "cost": cost,
    })
}

#[test]
fn drift_26_replies() {
    assert_reply(
        &cheap(),
        reply(true, 2, 3),
        "#26 cheap: delete(0) walks 1, insert(5, 2) walks 2, solved with cost 5",
    );
    let costly = drift(json!([
        {"kind": "delete", "index": 3},
        {"kind": "delete", "index": 0},
        {"kind": "insert", "value": 5, "index": 2},
        {"kind": "insert", "value": 1, "index": 3},
    ]));
    assert_reply(
        &costly,
        reply(true, 4, 10),
        "#26 costly: walks 4 + 1 + 2 + 3 = 10, solved with cost 14",
    );
    let unsolved = drift(json!([{"kind": "insert", "value": 5, "index": 0}]));
    assert_reply(
        &unsolved,
        reply(false, 1, 0),
        "#26 unsolved: insert(5, 0) walks 0 and leaves [5, 8, 3, 6, 1], so score is null but the counts are kept",
    );
}

#[test]
fn edge_replies() {
    let same = json!({"template": DRIFT, "start": [1, 2], "target": [1, 2], "operations": []});
    assert_reply(
        &same,
        reply(true, 0, 0),
        "no operations on a start that already is the target is solved with cost 0",
    );
    let clamped = json!({
        "template": DRIFT, "start": [1, 2], "target": [1, 2, 9],
        "operations": [{"kind": "insert", "value": 9, "index": 10}],
    });
    assert_reply(
        &clamped,
        reply(true, 1, 2),
        "insert(9, 10) on 2 nodes walks min(10, 2) = 2 and appends",
    );
    let extremes = json!({
        "template": DRIFT, "start": [i32::MIN, 0, i32::MAX], "target": [i32::MIN, -1, i32::MAX],
        "operations": [{"kind": "delete", "index": 1}, {"kind": "insert", "value": -1, "index": 1}],
    });
    assert_reply(
        &extremes,
        reply(true, 2, 3),
        "i32::MIN, i32::MAX and negative values are read as list values",
    );
}

#[test]
fn rejects_missing_or_null_fields() {
    assert_reply(
        &cheap(),
        reply(true, 2, 3),
        "baseline: the unchanged #26 cheap request is valid",
    );
    for field in ["start", "target", "operations"] {
        assert_rejected(
            &without(cheap(), field),
            field,
            "a linked-list-index-drift request needs this field",
        );
        assert_rejected(
            &with(cheap(), field, Value::Null),
            field,
            "a null value for this field should fail",
        );
    }
}

#[test]
fn rejects_fields_of_other_templates() {
    assert_reply(
        &cheap(),
        reply(true, 2, 3),
        "baseline: the unchanged #26 cheap request is valid",
    );
    let cases = [
        ("values", json!([8, 3, 6, 1])),
        ("fixed", json!([])),
        ("arrangement", json!([8, 3, 6, 1])),
        ("targetPasses", json!(1)),
        ("targetTree", json!([3, 1, 6, 8])),
    ];
    for (field, value) in cases {
        assert_rejected(
            &with(cheap(), field, value),
            field,
            "linked-list-index-drift takes only start, target and operations",
        );
    }
}

#[test]
fn other_templates_reject_list_fields() {
    for template in OTHER_TEMPLATES {
        let mut request = json!({
            "template": template, "values": [1, 2], "fixed": [], "arrangement": [2, 1],
        });
        if template == "bubble-exact-passes" {
            request["targetPasses"] = json!(1);
        }
        if template == "bst-forced-order" {
            request = without(request, "fixed");
            request["targetTree"] = json!([1, 2]);
        }
        let fields = [
            ("start", json!([1, 2])),
            ("target", json!([2, 1])),
            ("operations", json!([{"kind": "delete", "index": 0}])),
        ];
        for (field, value) in fields {
            assert_rejected(
                &with(request.clone(), field, value),
                field,
                "only linked-list-index-drift takes start, target and operations",
            );
        }
    }
}

#[test]
fn rejects_bad_operations() {
    assert_reply(
        &cheap(),
        reply(true, 2, 3),
        "baseline: the unchanged #26 cheap request is valid",
    );
    let cases = [
        (json!([{"kind": "delete", "index": -1}]), "a negative index"),
        (
            json!([{"kind": "delete", "index": 1.5}]),
            "a fractional index",
        ),
        (json!([{"kind": "delete"}]), "a delete with no index"),
        (
            json!([{"kind": "delete", "index": 0, "value": null}]),
            "a delete with an unexpected null value",
        ),
        (
            json!([{"kind": "insert", "value": 5, "index": 0, "extra": true}]),
            "an insert with an unknown field",
        ),
        (
            json!([{"kind": "insert", "index": 0}]),
            "an insert with no value",
        ),
        (
            json!([{"kind": "insert", "value": 2_147_483_648_i64, "index": 0}]),
            "a value past i32::MAX",
        ),
        (json!([{"kind": "move", "index": 0}]), "an unknown kind"),
        (json!([{"index": 0}]), "an operation with no kind"),
        (
            json!({"kind": "delete", "index": 0}),
            "operations that is not a list",
        ),
    ];
    for (operations, behaviour) in cases {
        assert_rejected(&drift(operations), "", &format!("{behaviour} should fail"));
    }
    for (field, value) in [
        ("start", json!([1.5])),
        ("target", json!([2_147_483_648_i64])),
        ("start", json!("8, 3, 6, 1")),
    ] {
        assert_rejected(
            &with(cheap(), field, value),
            "",
            &format!("{field} values have to be 32-bit integers"),
        );
    }
}

#[test]
fn delete_past_the_end_names_the_delete() {
    assert_reply(
        &cheap(),
        reply(true, 2, 3),
        "baseline: the unchanged #26 cheap request is valid",
    );
    let past = drift(json!([{"kind": "delete", "index": 4}]));
    assert_rejected(
        &past,
        "delete",
        "delete(4) on a 4-node list is past the end and should fail",
    );
    let shrunk = drift(json!([
        {"kind": "delete", "index": 0},
        {"kind": "delete", "index": 3},
    ]));
    assert_rejected(
        &shrunk,
        "delete",
        "delete(3) after delete(0) left 3 nodes is past the end and should fail",
    );
    let empty = json!({
        "template": DRIFT, "start": [], "target": [],
        "operations": [{"kind": "delete", "index": 0}],
    });
    assert_rejected(&empty, "delete", "delete(0) on an empty list should fail");
}
