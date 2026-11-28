use daily_challenges::heap::{self, HeapOp, HeapOrder};
use daily_challenges::wire::step_log_request;
use serde_json::{Value, json};

// Wire JSON for the `step_log` export, `algorithm: "binary-heap"` (docs/heap.md, 1b).
// Expected replies are worked by hand from the 1a contract ("Exact step order"): a 0-indexed
// array, children of i at 2i + 1 and 2i + 2, "better" is strictly smaller (min) or strictly
// greater (max), equal keys never swap, sift down picks the left child on a tie. `comparisons`
// counts compareParent and compareChildren steps, `swaps` counts swap steps.

const ALGORITHM: &str = "binary-heap";

fn request(order: &str, capacity: usize, items: &[i32], op: Value) -> Value {
    json!({
        "algorithm": ALGORITHM,
        "order": order,
        "capacity": capacity,
        "items": items,
        "op": op,
    })
}

fn insert(key: i32) -> Value {
    json!({"kind": "insert", "key": key})
}

fn pop() -> Value {
    json!({"kind": "pop"})
}

fn rebuild() -> Value {
    json!({"kind": "rebuild"})
}

fn append(key: i32, index: usize) -> Value {
    json!({"kind": "append", "key": key, "index": index})
}

fn compare_parent(index: usize, parent: usize, swap: bool) -> Value {
    json!({"kind": "compareParent", "index": index, "parent": parent, "swap": swap})
}

fn compare_children(
    index: usize,
    left: usize,
    right: Option<usize>,
    best: usize,
    swap: bool,
) -> Value {
    json!({
        "kind": "compareChildren", "index": index, "left": left,
        "right": right, "best": best, "swap": swap,
    })
}

fn swap(parent: usize, child: usize) -> Value {
    json!({"kind": "swap", "parent": parent, "child": child})
}

fn settled(key: i32, index: usize) -> Value {
    json!({"kind": "settled", "key": key, "index": index})
}

fn reinserted(key: i32, index: usize) -> Value {
    json!({"kind": "reinserted", "key": key, "index": index})
}

/// The whole reply, with `comparisons` and `swaps` counted from the hand-written `steps`.
fn reply(items: &[i32], steps: Vec<Value>, popped: Option<i32>) -> Value {
    let count = |kinds: &[&str]| {
        steps
            .iter()
            .filter(|step| kinds.iter().any(|kind| step["kind"] == *kind))
            .count()
    };
    let comparisons = count(&["compareParent", "compareChildren"]);
    let swaps = count(&["swap"]);
    json!({
        "items": items, "steps": steps, "comparisons": comparisons,
        "swaps": swaps, "popped": popped,
    })
}

fn assert_reply(request: &Value, expected: Value, behaviour: &str) {
    let bytes = request.to_string().into_bytes();
    let reply = step_log_request(&bytes).unwrap_or_else(|message| {
        panic!("step_log_request({request}) should succeed ({behaviour}), got Err({message:?})")
    });
    let reply: Value = serde_json::from_str(&reply).unwrap_or_else(|error| {
        panic!("step_log_request({request}) reply {reply:?} should be JSON: {error}")
    });
    assert_eq!(
        reply, expected,
        "step_log_request({request}): {behaviour};\n expected {expected},\n got      {reply}"
    );
}

/// Must fail with a non-empty message containing every needle (ignoring case). Returns it.
fn assert_rejected(request: &Value, needles: &[&str], behaviour: &str) -> String {
    let reply = step_log_request(request.to_string().as_bytes());
    let message = reply.clone().err().unwrap_or_default();
    let lower = message.to_lowercase();
    let named = needles
        .iter()
        .all(|needle| lower.contains(&needle.to_lowercase()));
    assert!(
        reply.is_err() && !message.trim().is_empty() && named,
        "step_log_request({request}): {behaviour}, so it should return Err with a non-empty message naming {needles:?}; got {reply:?}"
    );
    message
}

/// Reads `field` of the test's own request as a `T`, to call `heap::run` directly.
fn decode<T: serde::de::DeserializeOwned>(request: &Value, field: &str) -> T {
    let value = &request[field];
    serde_json::from_value(value.clone()).unwrap_or_else(|error| {
        panic!("test fixture broken: `{field}` {value} of request {request} should decode as {}: {error}", std::any::type_name::<T>())
    })
}

/// Must fail with exactly the message `heap::run` gives for the request's fields.
fn assert_run_error_unchanged(request: &Value, needles: &[&str], behaviour: &str) {
    let message = assert_rejected(request, needles, behaviour);
    let order: HeapOrder = decode(request, "order");
    let capacity: usize = decode(request, "capacity");
    let items: Vec<i32> = decode(request, "items");
    let op: HeapOp = decode(request, "op");
    let direct = heap::run(order, capacity, &items, op);
    assert_eq!(
        Err(message.clone()),
        direct,
        "step_log_request({request}): {behaviour}; the wire should return heap::run's error unchanged.\n wire      Err({message:?})\n heap::run {direct:?}"
    );
}

fn baseline() -> Value {
    request("max", 15, &[9, 4, 7], insert(8))
}

fn assert_baseline() {
    let steps = vec![
        append(8, 3),
        compare_parent(3, 1, true),
        swap(1, 3),
        compare_parent(1, 0, false),
        settled(8, 1),
    ];
    assert_reply(
        &baseline(),
        reply(&[9, 8, 7, 4], steps, None),
        "baseline: max insert(8) into [9, 4, 7] appends at 3, swaps past 4, stops below 9 at 1",
    );
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

#[test]
fn max_insert_sifts_part_of_the_way() {
    assert_baseline();
}

#[test]
fn min_insert_sifts_to_the_root() {
    let steps = vec![
        append(1, 4),
        compare_parent(4, 1, true),
        swap(1, 4),
        compare_parent(1, 0, true),
        swap(0, 1),
        settled(1, 0),
    ];
    assert_reply(
        &request("min", 15, &[2, 4, 3, 5], insert(1)),
        reply(&[1, 2, 3, 5, 4], steps, None),
        "min insert(1) into [2, 4, 3, 5] appends at 4, swaps past 4 then 2, settles at the root",
    );
}

#[test]
fn insert_of_an_equal_key_does_not_swap() {
    let steps = vec![append(2, 2), compare_parent(2, 0, false), settled(2, 2)];
    assert_reply(
        &request("min", 15, &[2, 4], insert(2)),
        reply(&[2, 4, 2], steps, None),
        "min insert(2) under an equal parent 2 is not better, so it stays at 2",
    );
}

#[test]
fn insert_into_an_empty_heap() {
    for order in ["min", "max"] {
        assert_reply(
            &request(order, 15, &[], insert(5)),
            reply(&[5], vec![append(5, 0), settled(5, 0)], None),
            &format!("{order} insert(5) into [] appends at 0 and settles there with no compare"),
        );
    }
}

#[test]
fn insert_into_a_full_heap_is_heap_full() {
    let full: Vec<i32> = (0..15).collect();
    assert_reply(
        &request("min", 15, &full, insert(3)),
        reply(&full, vec![json!({"kind": "heapFull", "key": 3})], None),
        "min insert(3) into 15 items at capacity 15 is heapFull, items unchanged",
    );
    assert_reply(
        &request("max", 3, &[9, 4, 7], insert(8)),
        reply(
            &[9, 4, 7],
            vec![json!({"kind": "heapFull", "key": 8})],
            None,
        ),
        "max insert(8) into [9, 4, 7] at capacity 3 is heapFull, items unchanged",
    );
}

#[test]
fn max_pop_sifts_down_and_stops() {
    let steps = vec![
        json!({"kind": "takeRoot", "key": 10}),
        json!({"kind": "moveLastToRoot", "key": 7, "from": 6}),
        compare_children(0, 1, Some(2), 1, true),
        swap(0, 1),
        compare_children(1, 3, Some(4), 4, false),
        settled(7, 1),
    ];
    assert_reply(
        &request("max", 15, &[10, 9, 8, 3, 5, 6, 7], pop()),
        reply(&[9, 7, 8, 3, 5, 6], steps, Some(10)),
        "max pop of [10, 9, 8, 3, 5, 6, 7] takes 10, moves 7 to the root, swaps with 9, stops above 3 and 5",
    );
}

#[test]
fn min_pop_sifts_past_a_node_with_only_a_left_child() {
    let steps = vec![
        json!({"kind": "takeRoot", "key": 1}),
        json!({"kind": "moveLastToRoot", "key": 5, "from": 4}),
        compare_children(0, 1, Some(2), 1, true),
        swap(0, 1),
        compare_children(1, 3, None, 3, true),
        swap(1, 3),
        settled(5, 3),
    ];
    assert_reply(
        &request("min", 15, &[1, 2, 3, 4, 5], pop()),
        reply(&[2, 4, 3, 5], steps, Some(1)),
        "min pop of [1, 2, 3, 4, 5] moves 5 to the root, swaps with 2, then with 4 (right: null), settles at 3",
    );
}

#[test]
fn pop_picks_the_left_child_on_a_tie() {
    let steps = vec![
        json!({"kind": "takeRoot", "key": 9}),
        json!({"kind": "moveLastToRoot", "key": 1, "from": 3}),
        compare_children(0, 1, Some(2), 1, true),
        swap(0, 1),
        settled(1, 1),
    ];
    assert_reply(
        &request("max", 15, &[9, 5, 5, 1], pop()),
        reply(&[5, 1, 5], steps, Some(9)),
        "max pop of [9, 5, 5, 1]: children 5 and 5 tie, so best is the left (1)",
    );
}

#[test]
fn pop_of_one_key_and_of_an_empty_heap() {
    let steps = vec![
        json!({"kind": "takeRoot", "key": 7}),
        json!({"kind": "poppedLast", "key": 7}),
    ];
    assert_reply(
        &request("max", 15, &[7], pop()),
        reply(&[], steps, Some(7)),
        "max pop of [7] takes 7 and ends with poppedLast, popped 7, items []",
    );
    for order in ["min", "max"] {
        assert_reply(
            &request(order, 15, &[], pop()),
            reply(&[], vec![json!({"kind": "empty"})], None),
            &format!("{order} pop of [] is empty, popped null"),
        );
    }
}

#[test]
fn rebuild_max_heap_as_min() {
    let steps = vec![
        json!({"kind": "startRebuild", "order": "min"}),
        append(9, 0),
        reinserted(9, 0),
        append(4, 1),
        compare_parent(1, 0, true),
        swap(0, 1),
        reinserted(4, 0),
        append(7, 2),
        compare_parent(2, 0, false),
        reinserted(7, 2),
        json!({"kind": "rebuilt", "order": "min"}),
    ];
    assert_reply(
        &request("min", 15, &[9, 4, 7], rebuild()),
        reply(&[4, 9, 7], steps, None),
        "rebuild of the max heap [9, 4, 7] as min re-inserts 9, 4, 7 in array order",
    );
}

#[test]
fn rebuild_min_heap_as_max() {
    let steps = vec![
        json!({"kind": "startRebuild", "order": "max"}),
        append(1, 0),
        reinserted(1, 0),
        append(3, 1),
        compare_parent(1, 0, true),
        swap(0, 1),
        reinserted(3, 0),
        append(2, 2),
        compare_parent(2, 0, false),
        reinserted(2, 2),
        append(5, 3),
        compare_parent(3, 1, true),
        swap(1, 3),
        compare_parent(1, 0, true),
        swap(0, 1),
        reinserted(5, 0),
        json!({"kind": "rebuilt", "order": "max"}),
    ];
    assert_reply(
        &request("max", 15, &[1, 3, 2, 5], rebuild()),
        reply(&[5, 3, 2, 1], steps, None),
        "rebuild of the min heap [1, 3, 2, 5] as max re-inserts 1, 3, 2, 5 in array order",
    );
}

#[test]
fn rebuild_of_an_empty_heap() {
    for order in ["min", "max"] {
        let steps = vec![
            json!({"kind": "startRebuild", "order": order}),
            json!({"kind": "rebuilt", "order": order}),
        ];
        assert_reply(
            &request(order, 15, &[], rebuild()),
            reply(&[], steps, None),
            &format!("{order} rebuild of [] is startRebuild then rebuilt"),
        );
    }
}

#[test]
fn rejects_missing_or_null_fields() {
    assert_baseline();
    for field in ["order", "capacity", "items", "op"] {
        assert_rejected(
            &without(baseline(), field),
            &[field],
            "a binary-heap request needs all of order, capacity, items and op",
        );
        assert_rejected(
            &with(baseline(), field, Value::Null),
            &[&format!("`{field}`")],
            "a null value is the wrong type, so the message names the field in backticks",
        );
    }
}

#[test]
fn rejects_unknown_top_level_fields() {
    assert_baseline();
    let cases = [
        ("extra", json!(true)),
        ("slots", json!([])),
        ("key", json!(8)),
    ];
    for (field, value) in cases {
        assert_rejected(
            &with(baseline(), field, value),
            &[field],
            "a binary-heap request takes only algorithm, order, capacity, items and op",
        );
    }
}

#[test]
fn rejects_wrong_typed_fields_naming_the_field() {
    assert_baseline();
    let cases = [
        ("order", json!(1), "an order that is a number"),
        ("order", json!("Min"), "a capitalised order"),
        ("order", json!("MAX"), "an upper-case order"),
        ("order", json!("ascending"), "an unknown order"),
        ("capacity", json!("15"), "a capacity that is a string"),
        ("capacity", json!(-1), "a negative capacity"),
        ("capacity", json!(1.5), "a fractional capacity"),
        ("items", json!("9,4,7"), "items that are a string"),
        ("items", json!([9, 4.5, 7]), "a fractional item"),
        ("items", json!([9, "4", 7]), "an item that is a string"),
        ("items", json!([2_147_483_648_i64]), "an item past i32::MAX"),
        ("op", json!("insert 8"), "an op that is a string"),
        ("op", json!({"kind": "insert"}), "an insert with no key"),
        ("op", json!({"kind": "insert", "key": "8"}), "a string key"),
        (
            "op",
            json!({"kind": "insert", "key": 2_147_483_648_i64}),
            "a key past i32::MAX",
        ),
        ("op", json!({"kind": "push", "key": 8}), "an unknown kind"),
        (
            "op",
            json!({"kind": "insert", "key": 8, "extra": 1}),
            "an insert with an unknown field",
        ),
    ];
    for (field, value, behaviour) in cases {
        assert_rejected(
            &with(baseline(), field, value),
            &[&format!("`{field}`")],
            &format!("{behaviour} is invalid"),
        );
    }
}

#[test]
fn rejects_capacity_zero_with_heap_runs_message() {
    assert_run_error_unchanged(
        &request("max", 0, &[], insert(1)),
        &["capacity"],
        "capacity 0 is rejected by heap::run",
    );
}

#[test]
fn rejects_too_many_items_naming_both_numbers() {
    assert_run_error_unchanged(
        &request("max", 2, &[9, 4, 7], pop()),
        &["2", "3"],
        "3 items at capacity 2 are rejected by heap::run, naming both numbers",
    );
}

#[test]
fn rejects_items_that_are_not_a_heap_naming_the_first_bad_index() {
    // Index 4 (11) is above its parent at 1 (10); index 6 (16) above 15 at 2 comes later.
    let max_items = [20, 10, 15, 5, 11, 12, 16];
    assert_run_error_unchanged(
        &request("max", 15, &max_items, insert(1)),
        &["4", "1"],
        "max items [20, 10, 15, 5, 11, 12, 16] break the heap first at index 4 (parent 1)",
    );
    // Index 3 (2) is below its parent at 1 (5).
    assert_run_error_unchanged(
        &request("min", 15, &[1, 5, 3, 2], pop()),
        &["3", "1"],
        "min items [1, 5, 3, 2] break the heap at index 3 (parent 1)",
    );
}

#[test]
fn rejects_a_rebuild_whose_items_are_not_a_heap_of_the_other_order() {
    // A max rebuild reads its items as a min heap: index 4 (0) is below its parent at 1 (3).
    assert_run_error_unchanged(
        &request("max", 15, &[1, 3, 2, 5, 0], rebuild()),
        &["4", "1"],
        "max rebuild of [1, 3, 2, 5, 0], not a min heap at index 4 (parent 1)",
    );
    // A min rebuild reads its items as a max heap: index 4 (8) is above its parent at 1 (4).
    assert_run_error_unchanged(
        &request("min", 15, &[9, 4, 7, 3, 8], rebuild()),
        &["4", "1"],
        "min rebuild of [9, 4, 7, 3, 8], not a max heap at index 4 (parent 1)",
    );
    // A heap already in the requested order is the wrong input for a rebuild.
    assert_run_error_unchanged(
        &request("min", 15, &[1, 3, 2], rebuild()),
        &["1", "0"],
        "min rebuild of the min heap [1, 3, 2], which is not a max heap at index 1 (parent 0)",
    );
}
