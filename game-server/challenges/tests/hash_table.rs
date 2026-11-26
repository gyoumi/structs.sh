use daily_challenges::hash_table::{
    DEFAULT_CAPACITY, HashOp, HashRunResult, HashSlot, HashStep, run,
};
use serde_json::{Value, json};

// Expected step logs are worked by hand from docs/hash-table.md ("Algorithm & data model" and
// "1a. Rust hash_table module"): h(key) = key.rem_euclid(capacity), linear probing by +1 mod
// capacity for at most capacity probes, and insert remembers the first tombstone but keeps
// probing until it finds the key, an empty slot, or has seen every slot.
//
// Each case is "OP KEY | table before | h: slots probed | terminal step | table after", where
// tables list one token per slot from slot 0 (capacity is the token count), the probed slots are
// visited at h, h + 1, ... mod capacity, `tok/i` means that Probe has first_tombstone Some(i),
// and `=` means the table is unchanged.
const LEGEND: &str = "slots from slot 0: `.` = Empty, `x` = Tombstone, n = Occupied { key: n }; \
    steps: `ComputeHash key K, capacity M, index I`, `Probe #N index I: SLOT, first_tombstone T`, \
    then the terminal step with its key and index";

fn slot(token: &str) -> HashSlot {
    match token {
        "." => HashSlot::Empty,
        "x" => HashSlot::Tombstone,
        n => HashSlot::Occupied {
            key: n.parse().expect("table token"),
        },
    }
}

fn table(spec: &str) -> Vec<HashSlot> {
    spec.split_whitespace().map(slot).collect()
}

fn token(slot: &HashSlot) -> String {
    match slot {
        HashSlot::Empty => ".".to_owned(),
        HashSlot::Tombstone => "x".to_owned(),
        HashSlot::Occupied { key } => key.to_string(),
    }
}

fn show(slots: &[HashSlot]) -> String {
    slots.iter().map(token).collect::<Vec<_>>().join(" ")
}

fn slot_text(slot: &HashSlot) -> String {
    match slot {
        HashSlot::Empty => "Empty".to_owned(),
        HashSlot::Tombstone => "Tombstone".to_owned(),
        HashSlot::Occupied { key } => format!("Occupied {key}"),
    }
}

fn op_text(op: &HashOp) -> String {
    match op {
        HashOp::Insert { key } => format!("Insert {{ key: {key} }}"),
        HashOp::Search { key } => format!("Search {{ key: {key} }}"),
        HashOp::Delete { key } => format!("Delete {{ key: {key} }}"),
    }
}

fn hash(key: i32, capacity: usize, index: usize) -> String {
    format!("ComputeHash key {key}, capacity {capacity}, index {index}")
}

fn probe(n: usize, index: usize, slot: &HashSlot, first: Option<usize>) -> String {
    let slot = slot_text(slot);
    format!("Probe #{n} index {index}: {slot}, first_tombstone {first:?}")
}

fn describe(step: &HashStep) -> String {
    match step {
        HashStep::ComputeHash {
            key,
            capacity,
            index,
        } => hash(*key, *capacity, *index),
        HashStep::Probe {
            index,
            slot,
            probe_number: n,
            first_tombstone: t,
        } => probe(*n as usize, *index, slot, *t),
        HashStep::Place {
            key,
            index,
            replaced_tombstone: r,
        } => {
            format!("Place {key} at {index}, replaced_tombstone {r}")
        }
        HashStep::AlreadyPresent { key, index } => format!("AlreadyPresent {key} at {index}"),
        HashStep::Found { key, index } => format!("Found {key} at {index}"),
        HashStep::NotFound { key } => format!("NotFound {key}"),
        HashStep::MarkTombstone { key, index } => format!("MarkTombstone {key} at {index}"),
        HashStep::TableFull { key } => format!("TableFull {key}"),
    }
}

/// Runs every case (see the format at the top of the file) and checks the step-log invariants,
/// the exact step log, and the returned slots.
fn cases(list: &[&str]) {
    for case in list {
        let fields: Vec<&str> = case.split(" | ").collect();
        let [op, before, probed, end, after] = fields[..] else {
            panic!("bad case {case}")
        };
        let (kind, key) = op.split_once(' ').expect("case op");
        let key: i32 = key.parse().expect("case key");
        let (start, seen) = probed.split_once(": ").expect("case probes");
        let start: usize = start.parse().expect("case h");
        let after = if after == "=" { before } else { after };
        check(before, (kind, key), start, seen, end, after);
    }
}

fn op(kind: &str, key: i32) -> HashOp {
    match kind {
        "Insert" => HashOp::Insert { key },
        "Search" => HashOp::Search { key },
        _ => HashOp::Delete { key },
    }
}

fn check(before: &str, (kind, key): (&str, i32), start: usize, seen: &str, end: &str, after: &str) {
    let slots = table(before);
    let m = slots.len();
    let mut want_steps = vec![hash(key, m, start)];
    for (n, tok) in seen.split_whitespace().enumerate() {
        let (tok, first) = match tok.split_once('/') {
            Some((tok, i)) => (tok, Some(i.parse().expect("first tombstone"))),
            None => (tok, None),
        };
        want_steps.push(probe(n + 1, (start + n) % m, &slot(tok), first));
    }
    want_steps.push(end.to_owned());
    let ctx = format!("run(capacity {m}, slots [{before}], {kind} {{ key: {key} }})");
    let insert = kind == "Insert";
    let result = match run(m, &slots, op(kind, key)) {
        Ok(result) => result,
        Err(e) => panic!("{ctx}: expected Ok, got Err({e:?})"),
    };
    let got: Vec<String> = result.steps.iter().map(describe).collect();
    let (want_log, got_log) = (want_steps.join("\n  "), got.join("\n  "));
    invariants(&ctx, m, key, insert, &result, &got_log);
    assert_eq!(
        got, want_steps,
        "{ctx}: wrong step log ({LEGEND})\nexpected:\n  {want_log}\nactual:\n  {got_log}"
    );
    let (want, actual) = (show(&table(after)), show(&result.slots));
    assert_eq!(
        actual, want,
        "{ctx}: returned slots ({LEGEND}) should be [{want}], got [{actual}]"
    );
}

fn invariants(ctx: &str, m: usize, key: i32, insert: bool, result: &HashRunResult, log: &str) {
    let start = i128::from(key).rem_euclid(m as i128) as usize;
    let mut problems = Vec::new();
    let want_first = hash(key, m, start);
    if result.steps.first().map(describe).as_deref() != Some(want_first.as_str()) {
        problems.push(format!("the first step should be {want_first}"));
    }
    let is_probe = |s: &&HashStep| matches!(s, HashStep::Probe { .. });
    let probes: Vec<_> = result.steps.iter().filter(is_probe).collect();
    let (count, reported) = (probes.len(), result.probes);
    if reported as usize != count {
        problems.push(format!(
            "HashRunResult.probes is {reported}; Probe steps: {count}"
        ));
    }
    if count > m {
        problems.push(format!("at most capacity ({m}) Probe steps, got {count}"));
    }
    for (n, step) in probes.iter().enumerate() {
        let HashStep::Probe {
            probe_number: number,
            index,
            first_tombstone: first,
            ..
        } = step
        else {
            continue;
        };
        let (want_n, want_index) = (n + 1, (start + n) % m);
        if *number as usize != want_n || *index != want_index {
            problems.push(format!(
                "Probe {want_n} should have probe_number {want_n} (1-based) and index \
                 {want_index} (h = {start}, then +1 mod {m}), got {number} and {index}"
            ));
        }
        if !insert && first.is_some() {
            problems.push(format!(
                "Search/Delete Probe {want_n} needs first_tombstone None"
            ));
        }
    }
    let terminal =
        |s: &HashStep| !matches!(s, HashStep::ComputeHash { .. } | HashStep::Probe { .. });
    let terminals = result.steps.iter().filter(|s| terminal(s)).count();
    if terminals != 1 || !result.steps.last().is_some_and(terminal) {
        problems.push(format!(
            "the log should end with exactly one terminal step (Place, AlreadyPresent, \
             TableFull, Found, NotFound or MarkTombstone), found {terminals}"
        ));
    }
    if result.steps.len() != count + 2 {
        problems.push("the log should be ComputeHash, only Probe steps, then the terminal".into());
    }
    let problems = problems.join("\n  - ");
    assert!(
        problems.is_empty(),
        "{ctx}: step-log invariants broken:\n  - {problems}\nlog:\n  {log}"
    );
}

#[test]
fn default_capacity_is_11() {
    let m = DEFAULT_CAPACITY;
    assert_eq!(m, 11, "DEFAULT_CAPACITY should be 11, got {m}");
}

#[test]
fn insert_places_new_keys_by_linear_probing() {
    cases(&[
        // Empty home slot h(23) = 1.
        "Insert 23 | . . . . . . . . . . . | 1: . | Place 23 at 1, replaced_tombstone false | . 23 . . . . . . . . .",
        // Collisions at 1 and 2.
        "Insert 23 | . 12 34 . . . . . . . . | 1: 12 34 . | Place 23 at 3, replaced_tombstone false | . 12 34 23 . . . . . . .",
        // Wrap-around from slot 10 to slot 0.
        "Insert 32 | 21 . . . . . . . . . 10 | 10: 10 21 . | Place 32 at 1, replaced_tombstone false | 21 32 . . . . . . . . 10",
    ]);
}

#[test]
fn insert_duplicate_is_already_present_and_changes_nothing() {
    cases(&[
        "Insert 23 | . 23 . . . . . . . . . | 1: 23 | AlreadyPresent 23 at 1 | =",
        "Insert 23 | . 12 23 . . . . . . . . | 1: 12 23 | AlreadyPresent 23 at 2 | =",
        // The tombstone is remembered, but insert keeps probing and finds 23 past it.
        "Insert 23 | . x 23 . . . . . . . . | 1: x/1 23/1 | AlreadyPresent 23 at 2 | =",
        "Insert 32 | x 21 32 . . . . . . . 10 | 10: 10 x/0 21/0 32/0 | AlreadyPresent 32 at 2 | =",
    ]);
}

#[test]
fn insert_new_key_reuses_the_first_tombstone() {
    cases(&[
        // Later tombstones do not change first_tombstone; 23 goes in the first one.
        "Insert 23 | . x 12 x . . . . . . . | 1: x/1 12/1 x/1 ./1 | Place 23 at 1, replaced_tombstone true | . 23 12 x . . . . . . .",
        // first_tombstone stays None until a tombstone is seen, here just after wrapping 10 -> 0.
        "Insert 32 | x 21 . . . . . . . . 10 | 10: 10 x/0 21/0 ./0 | Place 32 at 0, replaced_tombstone true | 32 21 . . . . . . . . 10",
    ]);
}

#[test]
fn insert_with_no_empty_slot_probes_every_slot_before_using_a_tombstone() {
    cases(&[
        "Insert 45 | 22 12 13 x 15 16 17 x 19 20 21 | 1: 12 13 x/3 15/3 16/3 17/3 x/3 19/3 20/3 21/3 22/3 | Place 45 at 3, replaced_tombstone true | 22 12 13 45 15 16 17 x 19 20 21",
        // 45 is in slot 0, the 11th and last slot probed from h(45) = 1.
        "Insert 45 | 45 12 13 x 15 16 17 x 19 20 21 | 1: 12 13 x/3 15/3 16/3 17/3 x/3 19/3 20/3 21/3 45/3 | AlreadyPresent 45 at 0 | =",
    ]);
}

#[test]
fn insert_into_full_table_is_table_full() {
    cases(&[
        "Insert 45 | 22 12 13 14 15 16 17 18 19 20 21 | 1: 12 13 14 15 16 17 18 19 20 21 22 | TableFull 45 | =",
        "Insert 14 | 22 12 13 14 15 16 17 18 19 20 21 | 3: 14 | AlreadyPresent 14 at 3 | =",
    ]);
}

#[test]
fn search_finds_keys_without_changing_the_table() {
    cases(&[
        "Search 23 | . 23 . . . . . . . . . | 1: 23 | Found 23 at 1 | =",
        "Search 23 | . 12 23 . . . . . . . . | 1: 12 23 | Found 23 at 2 | =",
        "Search 32 | 21 32 . . . . . . . . 10 | 10: 10 21 32 | Found 32 at 1 | =",
        "Search 23 | . x 12 x 23 . . . . . . | 1: x 12 x 23 | Found 23 at 4 | =",
    ]);
}

#[test]
fn search_misses_stop_at_empty_or_after_every_slot() {
    cases(&[
        "Search 23 | . 12 x . . . . . . . . | 1: 12 x . | NotFound 23 | =",
        "Search 45 | 22 12 13 x 15 16 17 x 19 20 21 | 1: 12 13 x 15 16 17 x 19 20 21 22 | NotFound 45 | =",
    ]);
}

#[test]
fn delete_marks_only_the_found_slot_as_a_tombstone() {
    cases(&[
        "Delete 23 | . 23 . . . . . . . . . | 1: 23 | MarkTombstone 23 at 1 | . x . . . . . . . . .",
        "Delete 23 | . 12 23 34 . . . . . . . | 1: 12 23 | MarkTombstone 23 at 2 | . 12 x 34 . . . . . . .",
        "Delete 32 | x 21 32 43 . . . . . . 10 | 10: 10 x 21 32 | MarkTombstone 32 at 2 | x 21 x 43 . . . . . . 10",
    ]);
}

#[test]
fn delete_misses_stop_at_empty_or_after_every_slot() {
    cases(&[
        "Delete 23 | . 12 . . . . . . . . . | 1: 12 . | NotFound 23 | =",
        "Delete 45 | 22 12 13 14 15 16 17 18 19 20 21 | 1: 12 13 14 15 16 17 18 19 20 21 22 | NotFound 45 | =",
        "Delete 45 | 22 12 13 x 15 16 17 x 19 20 21 | 1: 12 13 x 15 16 17 x 19 20 21 22 | NotFound 45 | =",
    ]);
}

#[test]
fn negative_and_extreme_keys_hash_with_rem_euclid() {
    cases(&[
        // -1 and -12 both hash to 10.
        "Insert -1 | . . . . . . . . . . . | 10: . | Place -1 at 10, replaced_tombstone false | . . . . . . . . . . -1",
        "Insert -12 | . . . . . . . . . . -1 | 10: -1 . | Place -12 at 0, replaced_tombstone false | -12 . . . . . . . . . -1",
        // i32::MIN = -2147483648 = 11 * -195225787 + 9.
        "Insert -2147483648 | . . . . . . . . . . . | 9: . | Place -2147483648 at 9, replaced_tombstone false | . . . . . . . . . -2147483648 .",
        "Search -2147483648 | . . . . . . . . . -2147483648 . | 9: -2147483648 | Found -2147483648 at 9 | =",
        "Delete -2147483648 | . . . . . . . . . -2147483648 . | 9: -2147483648 | MarkTombstone -2147483648 at 9 | . . . . . . . . . x .",
        // i32::MAX = 2147483647 = 11 * 195225786 + 1.
        "Insert 2147483647 | . . . . . . . . . . . | 1: . | Place 2147483647 at 1, replaced_tombstone false | . 2147483647 . . . . . . . . .",
        // With capacity 3, i32::MIN = 3 * -715827883 + 1.
        "Insert -2147483648 | . . . | 1: . | Place -2147483648 at 1, replaced_tombstone false | . -2147483648 .",
    ]);
}

#[test]
fn capacity_other_than_11_is_honoured() {
    cases(&[
        "Insert 4 | 5 x 7 | 1: x/1 7/1 5/1 | Place 4 at 1, replaced_tombstone true | 5 4 7",
        "Insert 6 | 3 4 5 | 0: 3 4 5 | TableFull 6 | =",
        "Search 6 | 3 4 5 | 0: 3 4 5 | NotFound 6 | =",
        "Insert 7 | . | 0: . | Place 7 at 0, replaced_tombstone false | 7",
        "Search 7 | x | 0: x | NotFound 7 | =",
    ]);
}

#[test]
fn a_run_of_operations_keeps_tombstones_working() {
    cases(&[
        "Insert 12 | . . . . . . . . . . . | 1: . | Place 12 at 1, replaced_tombstone false | . 12 . . . . . . . . .",
        "Insert 23 | . 12 . . . . . . . . . | 1: 12 . | Place 23 at 2, replaced_tombstone false | . 12 23 . . . . . . . .",
        "Insert 34 | . 12 23 . . . . . . . . | 1: 12 23 . | Place 34 at 3, replaced_tombstone false | . 12 23 34 . . . . . . .",
        "Delete 23 | . 12 23 34 . . . . . . . | 1: 12 23 | MarkTombstone 23 at 2 | . 12 x 34 . . . . . . .",
        "Search 34 | . 12 x 34 . . . . . . . | 1: 12 x 34 | Found 34 at 3 | =",
        "Search 23 | . 12 x 34 . . . . . . . | 1: 12 x 34 . | NotFound 23 | =",
        "Delete 23 | . 12 x 34 . . . . . . . | 1: 12 x 34 . | NotFound 23 | =",
        "Insert 34 | . 12 x 34 . . . . . . . | 1: 12 x/2 34/2 | AlreadyPresent 34 at 3 | =",
        "Insert 45 | . 12 x 34 . . . . . . . | 1: 12 x/2 34/2 ./2 | Place 45 at 2, replaced_tombstone true | . 12 45 34 . . . . . . .",
        "Delete 12 | . 12 45 34 . . . . . . . | 1: 12 | MarkTombstone 12 at 1 | . x 45 34 . . . . . . .",
        "Search 45 | . x 45 34 . . . . . . . | 1: x 45 | Found 45 at 2 | =",
    ]);
}

fn expect_err(ctx: &str, result: Result<HashRunResult, String>) -> String {
    match result {
        Ok(r) => panic!("{ctx}: expected Err, got Ok: [{}]", show(&r.slots)),
        Err(message) => message,
    }
}

#[test]
fn zero_capacity_is_rejected() {
    for spec in ["", ". ."] {
        let ctx = format!("run(capacity 0, slots [{spec}], Insert {{ key: 5 }})");
        let message = expect_err(&ctx, run(0, &table(spec), op("Insert", 5)));
        let ok = message.to_lowercase().contains("capacity");
        assert!(ok, "{ctx}: error should name capacity, got {message:?}");
    }
}

#[test]
fn slot_count_must_match_capacity() {
    for (capacity, len, kind) in [(11, 10, "Insert"), (11, 12, "Search"), (3, 7, "Delete")] {
        let ctx = format!("run(capacity {capacity}, {len} Empty slots, {kind} {{ key: 5 }})");
        let slots: Vec<HashSlot> = (0..len).map(|_| HashSlot::Empty).collect();
        let message = expect_err(&ctx, run(capacity, &slots, op(kind, 5)));
        let lower = message.to_lowercase();
        let named = message.contains(&capacity.to_string()) && message.contains(&len.to_string());
        assert!(
            lower.contains("capacity") && lower.contains("slot") && named,
            "{ctx}: the error should mention capacity ({capacity}) and slots.len() ({len}), \
             got {message:?}"
        );
    }
}

fn parse<T: serde::de::DeserializeOwned>(what: &str, json: &Value) -> T {
    serde_json::from_value(json.clone())
        .unwrap_or_else(|e| panic!("{what}: deserialising {json} failed: {e}"))
}

#[test]
fn hash_slot_and_op_json_use_kind_tags() {
    let slots = table(". -7 x");
    let want = json!([{"kind": "empty"}, {"kind": "occupied", "key": -7}, {"kind": "tombstone"}]);
    let got = serde_json::to_value(&slots).expect("serialise slots");
    let what = "[Empty, Occupied { key: -7 }, Tombstone]";
    assert_eq!(got, want, "{what} as JSON should be {want}, got {got}");
    let back = show(&parse::<Vec<HashSlot>>("HashSlot", &want));
    let ok = back == ". -7 x";
    assert!(ok, "{want} should read back as {what}, got [{back}]");
    let ops = [op("Insert", 5), op("Search", -3), op("Delete", 99)];
    let want = json!([{"kind": "insert", "key": 5}, {"kind": "search", "key": -3}, {"kind": "delete", "key": 99}]);
    let got = serde_json::to_value(ops.as_slice()).expect("serialise ops");
    let what: Vec<String> = ops.iter().map(op_text).collect();
    assert_eq!(got, want, "{what:?} as JSON should be {want}, got {got}");
    let back: Vec<HashOp> = parse("HashOp", &want);
    let back: Vec<String> = back.iter().map(op_text).collect();
    assert_eq!(
        back, what,
        "{want} should read back as {what:?}, got {back:?}"
    );
}

#[test]
fn run_results_serialise_as_camel_case_json() {
    // Capacity-1 runs, one per terminal step; their logs follow the cases above.
    let cases = json!([
        {"slots": "x", "op": {"kind": "insert", "key": 7}, "reply": {"slots": [{"kind": "occupied", "key": 7}], "probes": 1, "steps": [
            {"kind": "computeHash", "key": 7, "capacity": 1, "index": 0},
            {"kind": "probe", "index": 0, "slot": {"kind": "tombstone"}, "probeNumber": 1, "firstTombstone": 0},
            {"kind": "place", "key": 7, "index": 0, "replacedTombstone": true}]}},
        {"slots": "7", "op": {"kind": "insert", "key": 7}, "reply": {"slots": [{"kind": "occupied", "key": 7}], "probes": 1, "steps": [
            {"kind": "computeHash", "key": 7, "capacity": 1, "index": 0},
            {"kind": "probe", "index": 0, "slot": {"kind": "occupied", "key": 7}, "probeNumber": 1, "firstTombstone": null},
            {"kind": "alreadyPresent", "key": 7, "index": 0}]}},
        {"slots": "7", "op": {"kind": "search", "key": 7}, "reply": {"slots": [{"kind": "occupied", "key": 7}], "probes": 1, "steps": [
            {"kind": "computeHash", "key": 7, "capacity": 1, "index": 0},
            {"kind": "probe", "index": 0, "slot": {"kind": "occupied", "key": 7}, "probeNumber": 1, "firstTombstone": null},
            {"kind": "found", "key": 7, "index": 0}]}},
        {"slots": ".", "op": {"kind": "search", "key": 7}, "reply": {"slots": [{"kind": "empty"}], "probes": 1, "steps": [
            {"kind": "computeHash", "key": 7, "capacity": 1, "index": 0},
            {"kind": "probe", "index": 0, "slot": {"kind": "empty"}, "probeNumber": 1, "firstTombstone": null},
            {"kind": "notFound", "key": 7}]}},
        {"slots": "7", "op": {"kind": "delete", "key": 7}, "reply": {"slots": [{"kind": "tombstone"}], "probes": 1, "steps": [
            {"kind": "computeHash", "key": 7, "capacity": 1, "index": 0},
            {"kind": "probe", "index": 0, "slot": {"kind": "occupied", "key": 7}, "probeNumber": 1, "firstTombstone": null},
            {"kind": "markTombstone", "key": 7, "index": 0}]}},
        {"slots": "5", "op": {"kind": "insert", "key": 7}, "reply": {"slots": [{"kind": "occupied", "key": 5}], "probes": 1, "steps": [
            {"kind": "computeHash", "key": 7, "capacity": 1, "index": 0},
            {"kind": "probe", "index": 0, "slot": {"kind": "occupied", "key": 5}, "probeNumber": 1, "firstTombstone": null},
            {"kind": "tableFull", "key": 7}]}}
    ]);
    for case in cases.as_array().unwrap() {
        let (spec, want) = (case["slots"].as_str().unwrap(), &case["reply"]);
        let op: HashOp = parse("HashOp", &case["op"]);
        let ctx = format!("run(capacity 1, slots [{spec}], {})", op_text(&op));
        let result = run(1, &table(spec), op).unwrap_or_else(|e| panic!("{ctx}: got Err({e:?})"));
        let got = serde_json::to_value(&result).expect("serialise HashRunResult");
        assert_eq!(
            &got, want,
            "{ctx}: HashRunResult JSON should be\n  {want}\ngot\n  {got}"
        );
        for (step, json) in result.steps.iter().zip(want["steps"].as_array().unwrap()) {
            let back = describe(&parse::<HashStep>(&ctx, json));
            let what = describe(step);
            assert_eq!(
                back, what,
                "{ctx}: {json} should read back as {what}, got {back}"
            );
        }
    }
}

#[test]
fn unknown_or_snake_case_fields_are_rejected() {
    // Only variants with fields can reject extras: serde ignores extra keys on tagged unit variants.
    let slot = json!({"kind": "occupied", "key": 1, "extra": 1});
    let rejected = serde_json::from_value::<HashSlot>(slot.clone()).is_err();
    assert!(
        rejected,
        "HashSlot from {slot}: the unknown field `extra` should be rejected"
    );
    let op = json!({"kind": "insert", "key": 1, "value": 2});
    let rejected = serde_json::from_value::<HashOp>(op.clone()).is_err();
    assert!(
        rejected,
        "HashOp from {op}: the unknown field `value` should be rejected"
    );
    let steps = json!([
        {"kind": "found", "key": 1, "index": 2, "line": 5},
        {"kind": "probe", "index": 1, "slot": {"kind": "empty"}, "probe_number": 1, "firstTombstone": null},
        {"kind": "place", "key": 1, "index": 2, "replaced_tombstone": false}
    ]);
    for step in steps.as_array().unwrap() {
        let rejected = serde_json::from_value::<HashStep>(step.clone()).is_err();
        assert!(
            rejected,
            "HashStep from {step}: an unknown or snake_case field should be rejected"
        );
    }
}
