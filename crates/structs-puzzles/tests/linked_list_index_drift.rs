use serde_json::json;
use structs_puzzles::linked_list_index_drift::{
    Instance, LinkedListIndexDrift, Operation, Outcome, Step,
};
use structs_puzzles::{InputError, Template};

// Costs are worked by hand with the rule in docs/puzzle-ideas.md ("Linked list costs"; no tail
// pointer): insert(v, 0) walks 0, insert(v, i) walks min(i, length before) and lands there,
// delete(i) walks i + 1. Cost = operations + nodes walked. Puzzle #26 matches
// `e2e/support/daily-list-fixtures.ts` (DRIFT_26).

fn inst(start: &[i32], target: &[i32]) -> Instance {
    Instance {
        start: start.to_vec(),
        target: target.to_vec(),
    }
}

fn ins(value: i32, index: usize) -> Operation {
    Operation::Insert { value, index }
}

fn del(index: usize) -> Operation {
    Operation::Delete { index }
}

fn drift_26() -> Instance {
    inst(&[8, 3, 6, 1], &[3, 6, 5, 1])
}

fn call(instance: &Instance, input: &[Operation]) -> String {
    format!(
        "LinkedListIndexDrift on start {:?}, target {:?} with operations {input:?}",
        instance.start, instance.target
    )
}

fn describe(step: &Step) -> String {
    match step {
        Step::Visit { index, value } => format!("Visit({value} at {index})"),
        Step::Insert { value, index } => format!("Insert({value} at {index})"),
        Step::Delete { index, value } => format!("Delete({value} at {index})"),
    }
}

fn log(instance: &Instance, input: &[Operation]) -> Vec<String> {
    LinkedListIndexDrift
        .run(instance, &input.to_vec())
        .unwrap_or_else(|e| panic!("{}: run returned error {e:?}", call(instance, input)))
        .iter()
        .map(describe)
        .collect()
}

/// Checks evaluate, score and run agree on one input: `want` is (operations, walked, final list).
fn check(instance: &Instance, input: &[Operation], want: (u32, u32, &[i32])) {
    let (operations, walked, final_list) = want;
    let ctx = call(instance, input);
    let solved = final_list == instance.target.as_slice();
    let expected = Outcome {
        solved,
        operations,
        nodes_walked: walked,
        cost: operations + walked,
        final_list: final_list.to_vec(),
    };
    let outcome = LinkedListIndexDrift
        .evaluate(instance, input)
        .unwrap_or_else(|e| panic!("{ctx}: evaluate returned error {e:?}"));
    assert_eq!(
        outcome,
        expected,
        "{ctx}: evaluate should give {operations} operations, {walked} nodes walked, cost {} and final list {final_list:?} (solved = final list == target)",
        operations + walked
    );
    let score = LinkedListIndexDrift
        .score(instance, &input.to_vec())
        .unwrap_or_else(|e| panic!("{ctx}: score returned error {e:?}"));
    let expected_score = if solved { operations + walked } else { 0 };
    assert_eq!(
        score, expected_score,
        "{ctx}: score should be {expected_score} (the cost when solved, 0 when unsolved), got {score}"
    );
    let steps = log(instance, input);
    let visits = steps.iter().filter(|s| s.starts_with("Visit")).count();
    assert_eq!(
        visits, walked as usize,
        "{ctx}: run should log one Visit per node walked ({walked}), got {visits}; log {steps:?}"
    );
    let actions = steps.len() - visits;
    assert_eq!(
        actions,
        input.len(),
        "{ctx}: run should log one Insert or Delete step per operation ({}), got {actions}; log {steps:?}",
        input.len()
    );
}

#[test]
fn template_id() {
    assert_eq!(
        LinkedListIndexDrift::ID,
        "linked-list-index-drift",
        "LinkedListIndexDrift::ID should be \"linked-list-index-drift\", got {:?}",
        LinkedListIndexDrift::ID
    );
}

#[test]
fn drift_26_tries() {
    let puzzle = drift_26();
    // unsolved: insert(5, 0) walks 0.
    check(&puzzle, &[ins(5, 0)], (1, 0, &[5, 8, 3, 6, 1]));
    // cheap: delete(0) walks 1, insert(5, 2) walks min(2, 3) = 2.
    check(&puzzle, &[del(0), ins(5, 2)], (2, 3, &[3, 6, 5, 1]));
    // costly: delete(3) 4 + delete(0) 1 + insert(5, 2) 2 + insert(1, 3) 3.
    let costly = [del(3), del(0), ins(5, 2), ins(1, 3)];
    check(&puzzle, &costly, (4, 10, &[3, 6, 5, 1]));
}

#[test]
fn exact_log_for_drift_26_cheap() {
    let puzzle = drift_26();
    let input = [del(0), ins(5, 2)];
    assert_eq!(
        log(&puzzle, &input),
        [
            "Visit(8 at 0)",
            "Delete(8 at 0)",
            "Visit(3 at 0)",
            "Visit(6 at 1)",
            "Insert(5 at 2)"
        ],
        "{}: each operation logs the nodes its pointer lands on, front to back, then the insert or delete",
        call(&puzzle, &input)
    );
}

#[test]
fn insert_index_is_clamped_to_the_length() {
    // insert(9, 10) on [1, 2] walks min(10, 2) = 2 and appends.
    let instance = inst(&[1, 2], &[1, 2, 9]);
    check(&instance, &[ins(9, 10)], (1, 2, &[1, 2, 9]));
    assert_eq!(
        log(&instance, &[ins(9, 10)]),
        ["Visit(1 at 0)", "Visit(2 at 1)", "Insert(9 at 2)"],
        "{}: Step::Insert should carry the clamped index min(10, 2) = 2, not the requested 10",
        call(&instance, &[ins(9, 10)])
    );
    // Into an empty list nothing is walked, whatever the index.
    let empty = inst(&[], &[4]);
    check(&empty, &[ins(4, 3)], (1, 0, &[4]));
    assert_eq!(
        log(&empty, &[ins(4, 3)]),
        ["Insert(4 at 0)"],
        "{}: inserting into an empty list walks nothing and lands at index 0",
        call(&empty, &[ins(4, 3)])
    );
    // insert(v, 0) on a non-empty list never walks.
    check(
        &inst(&[1, 2, 3], &[0, 1, 2, 3]),
        &[ins(0, 0)],
        (1, 0, &[0, 1, 2, 3]),
    );
    // insert(v, 1) walks the head only.
    check(
        &inst(&[1, 2, 3], &[1, 7, 2, 3]),
        &[ins(7, 1)],
        (1, 1, &[1, 7, 2, 3]),
    );
}

#[test]
fn delete_walks_up_to_and_including_its_node() {
    let instance = inst(&[1, 2, 3], &[1, 2]);
    check(&instance, &[del(2)], (1, 3, &[1, 2]));
    assert_eq!(
        log(&instance, &[del(2)]),
        [
            "Visit(1 at 0)",
            "Visit(2 at 1)",
            "Visit(3 at 2)",
            "Delete(3 at 2)"
        ],
        "{}: delete(2) walks i + 1 = 3 nodes, then removes the node at index 2",
        call(&instance, &[del(2)])
    );
    check(
        &inst(&[4, 4, 4], &[]),
        &[del(0), del(0), del(0)],
        (3, 3, &[]),
    );
}

#[test]
fn no_operations_costs_nothing() {
    check(&inst(&[1, 2], &[1, 2]), &[], (0, 0, &[1, 2]));
    check(&inst(&[1, 2], &[2, 1]), &[], (0, 0, &[1, 2]));
    check(&inst(&[], &[]), &[], (0, 0, &[]));
}

#[test]
fn duplicates_and_extreme_values() {
    let instance = inst(&[i32::MIN, 0, i32::MAX], &[i32::MIN, -1, i32::MAX]);
    // delete(1) walks 2 -> [MIN, MAX]; insert(-1, 1) walks 1 -> [MIN, -1, MAX].
    check(
        &instance,
        &[del(1), ins(-1, 1)],
        (2, 3, &[i32::MIN, -1, i32::MAX]),
    );
    // Equal values are separate nodes: delete(1) removes the second 7.
    check(&inst(&[7, 7, 7], &[7, 7]), &[del(1)], (1, 2, &[7, 7]));
}

#[test]
fn delete_past_the_end_is_an_error_and_all_entry_points_agree() {
    // (label, instance, operations, (bad operation, its index, list length then)).
    let empty = inst(&[], &[]);
    let huge = vec![ins(5, 0), del(usize::MAX)];
    let cases = [
        ("delete on an empty list", empty, vec![del(0)], (0, 0, 0)),
        ("delete(4) on 4 nodes", drift_26(), vec![del(4)], (0, 4, 4)),
        (
            "an earlier delete left 3",
            drift_26(),
            vec![del(0), del(3)],
            (1, 3, 3),
        ),
        ("a huge index", drift_26(), huge, (1, usize::MAX, 5)),
        (
            "only the first bad one",
            inst(&[1], &[]),
            vec![del(0), del(0), del(5)],
            (1, 0, 0),
        ),
    ];
    for (label, instance, input, (operation, index, length)) in cases {
        let expected = InputError::DeleteIndexOutOfRange {
            operation,
            index,
            length,
        };
        let ctx = format!("{} ({label})", call(&instance, &input));
        assert_eq!(
            LinkedListIndexDrift.run(&instance, &input).err(),
            Some(expected.clone()),
            "{ctx}: run should fail with {expected:?}"
        );
        assert_eq!(
            LinkedListIndexDrift.score(&instance, &input).err(),
            Some(expected.clone()),
            "{ctx}: score should fail with {expected:?}"
        );
        assert_eq!(
            LinkedListIndexDrift.evaluate(&instance, &input).err(),
            Some(expected.clone()),
            "{ctx}: evaluate should fail with {expected:?}"
        );
    }
    // An insert first makes delete(4) valid on a 4-node start.
    check(&drift_26(), &[ins(9, 0), del(4)], (2, 5, &[9, 8, 3, 6]));
}

#[test]
fn operations_read_from_tagged_json() {
    let cases = [
        (
            json!({"kind": "insert", "value": -5, "index": 2}),
            ins(-5, 2),
        ),
        (json!({"kind": "delete", "index": 0}), del(0)),
    ];
    for (wire, expected) in cases {
        let got: Operation = serde_json::from_value(wire.clone())
            .unwrap_or_else(|e| panic!("Operation should deserialize from {wire}: {e}"));
        assert_eq!(got, expected, "Operation from {wire}");
        let back = serde_json::to_value(got)
            .unwrap_or_else(|e| panic!("Operation {got:?} should serialize: {e}"));
        assert_eq!(
            back, wire,
            "Operation {got:?} should serialize back to {wire}"
        );
    }
}

#[test]
fn rules_mention_the_target_list_and_cost() {
    let rules = LinkedListIndexDrift.rules(&drift_26()).to_lowercase();
    for needle in ["target list", "insert", "delete", "cost"] {
        assert!(
            rules.contains(needle),
            "LinkedListIndexDrift.rules should mention {needle:?} (case-insensitive), got {rules:?}"
        );
    }
}
