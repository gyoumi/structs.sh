use daily_challenges::wire::step_log_request;
use serde_json::{Value, json};

// Wire JSON for the `step_log` export, `algorithm: "hash-table-linear"`.
// Expected replies are worked by hand from the linear-probing contract in
// docs/hash-table.md (1a): h(key) = key.rem_euclid(capacity), probe +1 mod
// capacity, insert reuses the first tombstone, search and delete stop on an
// empty slot. Every table here has capacity 11 unless the test says otherwise.

const ALGORITHM: &str = "hash-table-linear";
const CAPACITY: usize = 11;

fn empty() -> Value {
    json!({"kind": "empty"})
}

fn occupied(key: i32) -> Value {
    json!({"kind": "occupied", "key": key})
}

fn tombstone() -> Value {
    json!({"kind": "tombstone"})
}

/// A capacity-11 table that is empty apart from `filled` (index, slot).
fn table(filled: &[(usize, Value)]) -> Vec<Value> {
    let mut slots = vec![empty(); CAPACITY];
    for (index, slot) in filled {
        slots[*index] = slot.clone();
    }
    slots
}

fn request(slots: &[Value], kind: &str, key: i32) -> Value {
    json!({
        "algorithm": ALGORITHM,
        "capacity": slots.len(),
        "slots": slots,
        "op": {"kind": kind, "key": key},
    })
}

fn compute_hash(key: i32, index: usize) -> Value {
    json!({"kind": "computeHash", "key": key, "capacity": CAPACITY, "index": index})
}

fn probe(index: usize, slot: Value, number: u32, first_tombstone: Option<usize>) -> Value {
    json!({
        "kind": "probe", "index": index, "slot": slot,
        "probeNumber": number, "firstTombstone": first_tombstone,
    })
}

fn reply(slots: Vec<Value>, steps: Vec<Value>) -> Value {
    let probes = steps.iter().filter(|step| step["kind"] == "probe").count();
    json!({"slots": slots, "steps": steps, "probes": probes})
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

/// The raw bytes must fail with a non-empty message containing every needle (ignoring case).
fn assert_rejected_bytes(bytes: &[u8], shown: &str, needles: &[&str], behaviour: &str) {
    let reply = step_log_request(bytes);
    let message = reply.clone().err().unwrap_or_default();
    let lower = message.to_lowercase();
    let named = needles
        .iter()
        .all(|needle| lower.contains(&needle.to_lowercase()));
    assert!(
        reply.is_err() && !message.trim().is_empty() && named,
        "step_log_request({shown}): {behaviour}, so it should return Err with a non-empty message naming {needles:?}; got {reply:?}"
    );
}

fn assert_rejected(request: &Value, needles: &[&str], behaviour: &str) {
    let shown = request.to_string();
    assert_rejected_bytes(shown.as_bytes(), &shown, needles, behaviour);
}

fn baseline() -> Value {
    request(&table(&[]), "insert", 23)
}

fn assert_baseline() {
    let mut slots = table(&[]);
    slots[1] = occupied(23);
    let steps = vec![
        compute_hash(23, 1),
        probe(1, empty(), 1, None),
        json!({"kind": "place", "key": 23, "index": 1, "replacedTombstone": false}),
    ];
    assert_reply(
        &baseline(),
        reply(slots, steps),
        "baseline: insert(23) into an empty table hashes to 1 and places it there",
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
fn insert_into_an_empty_slot() {
    assert_baseline();
}

#[test]
fn insert_wraps_around_past_collisions() {
    let start = table(&[(10, occupied(21)), (0, occupied(32))]);
    let mut slots = start.clone();
    slots[1] = occupied(43);
    let steps = vec![
        compute_hash(43, 10),
        probe(10, occupied(21), 1, None),
        probe(0, occupied(32), 2, None),
        probe(1, empty(), 3, None),
        json!({"kind": "place", "key": 43, "index": 1, "replacedTombstone": false}),
    ];
    assert_reply(
        &request(&start, "insert", 43),
        reply(slots, steps),
        "insert(43) hashes to 10, collides at 10 and 0 (wrapping), and lands in empty slot 1",
    );
}

#[test]
fn insert_duplicate_past_a_tombstone_is_already_present() {
    let start = table(&[(1, tombstone()), (2, occupied(12))]);
    let steps = vec![
        compute_hash(12, 1),
        probe(1, tombstone(), 1, Some(1)),
        probe(2, occupied(12), 2, Some(1)),
        json!({"kind": "alreadyPresent", "key": 12, "index": 2}),
    ];
    assert_reply(
        &request(&start, "insert", 12),
        reply(start.clone(), steps),
        "insert(12) steps past the tombstone at 1 (firstTombstone 1), finds 12 at 2, and leaves the table unchanged",
    );
}

#[test]
fn insert_reuses_the_first_tombstone() {
    let start = table(&[(1, tombstone()), (2, occupied(23))]);
    let mut slots = start.clone();
    slots[1] = occupied(34);
    let steps = vec![
        compute_hash(34, 1),
        probe(1, tombstone(), 1, Some(1)),
        probe(2, occupied(23), 2, Some(1)),
        probe(3, empty(), 3, Some(1)),
        json!({"kind": "place", "key": 34, "index": 1, "replacedTombstone": true}),
    ];
    assert_reply(
        &request(&start, "insert", 34),
        reply(slots, steps),
        "insert(34) probes on to the empty slot 3 to rule out a duplicate, then places 34 in the first tombstone (1)",
    );
}

#[test]
fn insert_into_a_full_table_is_table_full() {
    let start: Vec<Value> = (0..CAPACITY as i32).map(occupied).collect();
    let mut steps = vec![compute_hash(11, 0)];
    for index in 0..CAPACITY {
        steps.push(probe(index, occupied(index as i32), index as u32 + 1, None));
    }
    steps.push(json!({"kind": "tableFull", "key": 11}));
    assert_reply(
        &request(&start, "insert", 11),
        reply(start.clone(), steps),
        "insert(11) into slots holding 0..=10 probes all 11 slots and reports tableFull, table unchanged",
    );
}

#[test]
fn search_hit_past_a_tombstone() {
    let start = table(&[(3, tombstone()), (4, occupied(14))]);
    let steps = vec![
        compute_hash(14, 3),
        probe(3, tombstone(), 1, None),
        probe(4, occupied(14), 2, None),
        json!({"kind": "found", "key": 14, "index": 4}),
    ];
    assert_reply(
        &request(&start, "search", 14),
        reply(start.clone(), steps),
        "search(14) steps past the tombstone at 3 (firstTombstone stays null) and finds 14 at 4",
    );
}

#[test]
fn search_miss_stops_at_an_empty_slot() {
    let start = table(&[(5, occupied(5))]);
    let steps = vec![
        compute_hash(16, 5),
        probe(5, occupied(5), 1, None),
        probe(6, empty(), 2, None),
        json!({"kind": "notFound", "key": 16}),
    ];
    assert_reply(
        &request(&start, "search", 16),
        reply(start.clone(), steps),
        "search(16) hashes to 5, passes 5, stops at empty slot 6 with notFound",
    );
}

#[test]
fn delete_hit_marks_a_tombstone() {
    let start = table(&[(7, occupied(7))]);
    let mut slots = start.clone();
    slots[7] = tombstone();
    let steps = vec![
        compute_hash(7, 7),
        probe(7, occupied(7), 1, None),
        json!({"kind": "markTombstone", "key": 7, "index": 7}),
    ];
    assert_reply(
        &request(&start, "delete", 7),
        reply(slots, steps),
        "delete(7) finds 7 at 7 and turns that slot into a tombstone",
    );
}

#[test]
fn delete_miss_is_not_found() {
    let start = table(&[]);
    let steps = vec![
        compute_hash(9, 9),
        probe(9, empty(), 1, None),
        json!({"kind": "notFound", "key": 9}),
    ];
    assert_reply(
        &request(&start, "delete", 9),
        reply(start.clone(), steps),
        "delete(9) on an empty table stops at empty slot 9 with notFound, table unchanged",
    );
}

#[test]
fn negative_keys_hash_with_rem_euclid() {
    let start = table(&[]);
    let mut slots = start.clone();
    slots[10] = occupied(-1);
    let steps = vec![
        compute_hash(-1, 10),
        probe(10, empty(), 1, None),
        json!({"kind": "place", "key": -1, "index": 10, "replacedTombstone": false}),
    ];
    assert_reply(
        &request(&start, "insert", -1),
        reply(slots, steps),
        "insert(-1): -1 rem_euclid 11 is 10, so it lands in slot 10",
    );
    let steps = vec![
        compute_hash(i32::MIN, 9),
        probe(9, empty(), 1, None),
        json!({"kind": "notFound", "key": i32::MIN}),
    ];
    assert_reply(
        &request(&start, "search", i32::MIN),
        reply(start.clone(), steps),
        "search(i32::MIN = -2147483648): rem_euclid 11 is 9, an empty slot, so notFound",
    );
}

#[test]
fn rejects_an_unknown_algorithm_by_name() {
    assert_baseline();
    assert_rejected(
        &with(baseline(), "algorithm", json!("bfs")),
        &["bfs"],
        "\"bfs\" is not a step-log algorithm",
    );
}

#[test]
fn rejects_unreadable_requests() {
    assert_baseline();
    assert_rejected_bytes(b"not json", "b\"not json\"", &[], "the bytes are not JSON");
    assert_rejected_bytes(
        b"\xff\xfe",
        "b\"\\xff\\xfe\"",
        &[],
        "the bytes are not UTF-8",
    );
    assert_rejected_bytes(b"[]", "b\"[]\"", &[], "the request is not an object");
}

#[test]
fn rejects_missing_or_null_fields() {
    assert_baseline();
    for field in ["algorithm", "capacity", "slots", "op"] {
        assert_rejected(
            &without(baseline(), field),
            &[field],
            "every step-log request needs this field",
        );
        assert_rejected(
            &with(baseline(), field, Value::Null),
            &[],
            "a null value for this field should fail",
        );
    }
}

#[test]
fn rejects_unknown_top_level_fields() {
    assert_baseline();
    let cases = [
        ("extra", json!(true)),
        ("template", json!("quicksort-most-comparisons")),
        ("key", json!(23)),
    ];
    for (field, value) in cases {
        assert_rejected(
            &with(baseline(), field, value),
            &[field],
            "a hash-table-linear request takes only algorithm, capacity, slots and op",
        );
    }
}

#[test]
fn rejects_bad_slots() {
    assert_baseline();
    let cases = [
        (json!({"kind": "occupied"}), "an occupied slot with no key"),
        (json!({"kind": "full"}), "an unknown slot kind"),
        (json!({"key": 1}), "a slot with no kind"),
        (
            json!({"kind": "occupied", "key": 1, "extra": 1}),
            "an occupied slot with an unknown field",
        ),
        (
            json!({"kind": "occupied", "key": 2_147_483_648_i64}),
            "a key past i32::MAX",
        ),
        (json!(5), "a slot that is a bare number"),
    ];
    for (slot, behaviour) in cases {
        let mut slots = table(&[]);
        slots[0] = slot;
        assert_rejected(
            &request(&slots, "insert", 23),
            &[],
            &format!("slot 0 is {behaviour}"),
        );
    }
    assert_rejected(
        &with(baseline(), "slots", json!({"0": {"kind": "empty"}})),
        &[],
        "slots is not a list",
    );
}

#[test]
fn rejects_bad_ops() {
    assert_baseline();
    let cases = [
        (json!({"kind": "insert"}), "an insert with no key"),
        (json!({"kind": "upsert", "key": 1}), "an unknown op kind"),
        (json!({"key": 1}), "an op with no kind"),
        (json!({"kind": "insert", "key": 1.5}), "a fractional key"),
        (
            json!({"kind": "search", "key": 2_147_483_648_i64}),
            "a key past i32::MAX",
        ),
        (
            json!({"kind": "delete", "key": 1, "value": 2}),
            "a delete with an unknown field",
        ),
        (json!("insert 23"), "an op that is a string"),
    ];
    for (op, behaviour) in cases {
        assert_rejected(
            &with(baseline(), "op", op),
            &[],
            &format!("op is {behaviour}"),
        );
    }
}

#[test]
fn rejects_a_bad_capacity() {
    assert_baseline();
    for (capacity, behaviour) in [
        (json!(-1), "a negative capacity"),
        (json!(1.5), "a fractional capacity"),
        (json!("11"), "a capacity that is a string"),
    ] {
        assert_rejected(
            &with(baseline(), "capacity", capacity),
            &[],
            &format!("{behaviour} should fail"),
        );
    }
    let zero = json!({
        "algorithm": ALGORITHM, "capacity": 0, "slots": [],
        "op": {"kind": "insert", "key": 1},
    });
    assert_rejected(
        &zero,
        &["capacity"],
        "capacity 0 is rejected by hash_table::run",
    );
}

#[test]
fn rejects_slots_that_do_not_match_capacity() {
    assert_baseline();
    let short = with(baseline(), "slots", json!(vec![empty(); 4]));
    assert_rejected(
        &with(short, "capacity", json!(7)),
        &["capacity", "7", "4"],
        "capacity 7 with 4 slots is rejected by hash_table::run, naming both numbers",
    );
    let long = with(baseline(), "slots", json!(vec![empty(); 12]));
    assert_rejected(
        &long,
        &["capacity", "11", "12"],
        "capacity 11 with 12 slots is rejected by hash_table::run, naming both numbers",
    );
}
