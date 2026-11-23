use structs_puzzles::upset_bst_beats_avl::{Instance, Step, TreeKind, UpsetBstBeatsAvl};
use structs_puzzles::{InputError, Template};

// Nodes passed are worked by hand from `GraphicalBST.ts` and `GraphicalAVL.ts`: each existing node
// an insert compares against on its way down (a duplicate passes the equal node too, then stops),
// so the first key passes 0, and rotations are not counted. They match
// `e2e/support/daily-tree-fixtures.ts`.

fn inst(values: &[i32], fixed: &[usize]) -> Instance {
    Instance {
        values: values.to_vec(),
        fixed: fixed.to_vec(),
    }
}

fn free(values: &[i32]) -> Instance {
    let mut sorted = values.to_vec();
    sorted.sort_unstable();
    inst(&sorted, &[])
}

fn upset_25() -> Instance {
    inst(
        &[3, 2, 13, 6, 14, 1, 8, 10, 5, 12, 11, 7, 4, 9],
        &[0, 1, 5, 9, 11, 12],
    )
}

fn call(instance: &Instance, input: &[i32]) -> String {
    format!(
        "UpsetBstBeatsAvl on values {:?}, fixed {:?} with input {input:?}",
        instance.values, instance.fixed
    )
}

fn tree(kind: TreeKind) -> &'static str {
    match kind {
        TreeKind::Bst => "bst",
        TreeKind::Avl => "avl",
    }
}

fn describe(step: &Step) -> String {
    match *step {
        Step::Visit {
            tree: t,
            key,
            existing,
        } => format!("{}:Visit({key} at {existing})", tree(t)),
        Step::Insert { tree: t, key } => format!("{}:Insert({key})", tree(t)),
        Step::RotateLeft { pivot } => format!("avl:RotateLeft({pivot})"),
        Step::RotateRight { pivot } => format!("avl:RotateRight({pivot})"),
    }
}

fn log_of(instance: &Instance, input: &[i32]) -> Vec<String> {
    UpsetBstBeatsAvl
        .run(instance, &input.to_vec())
        .unwrap_or_else(|e| panic!("{}: run returned error {e:?}", call(instance, input)))
        .iter()
        .map(describe)
        .collect()
}

/// The steps of one tree, in order (AVL rotations belong to the AVL tree).
fn tree_log(log: &[String], prefix: &str) -> Vec<String> {
    log.iter()
        .filter_map(|entry| entry.strip_prefix(prefix).map(str::to_owned))
        .collect()
}

fn check(instance: &Instance, input: &[i32], bst: u32, avl: u32, rotations: usize) {
    let ctx = call(instance, input);
    let solved = bst < avl;
    let margin = avl.saturating_sub(bst);
    let outcome = UpsetBstBeatsAvl
        .evaluate(instance, input)
        .unwrap_or_else(|e| panic!("{ctx}: evaluate returned error {e:?}"));
    let got = (
        outcome.bst_nodes_passed,
        outcome.avl_nodes_passed,
        outcome.solved,
        outcome.margin,
    );
    assert_eq!(
        got,
        (bst, avl, solved, margin),
        "{ctx}: evaluate() (bst_nodes_passed, avl_nodes_passed, solved, margin) should be BST {bst}, AVL {avl}, solved {solved} (BST < AVL strictly), margin {margin} (AVL - BST, 0 when unsolved); rotations are not nodes passed"
    );
    let expected_score = if solved { margin } else { 0 };
    let score = UpsetBstBeatsAvl
        .score(instance, &input.to_vec())
        .unwrap_or_else(|e| panic!("{ctx}: score returned error {e:?}"));
    assert_eq!(
        score, expected_score,
        "{ctx}: score should be {expected_score} (the margin when solved, 0 when unsolved), got {score}"
    );
    let log = log_of(instance, input);
    let count = |prefix: &str, kind: &str| {
        tree_log(&log, prefix)
            .iter()
            .filter(|entry| entry.starts_with(kind))
            .count()
    };
    for (prefix, want) in [("bst:", bst), ("avl:", avl)] {
        assert_eq!(
            count(prefix, "Visit"),
            want as usize,
            "{ctx}: run should log {want} {prefix}Visit steps, one per node passed; log {log:?}"
        );
    }
    assert_eq!(
        count("avl:", "Rotate"),
        rotations,
        "{ctx}: run should log {rotations} AVL rotation steps (logged, but not counted as nodes passed); log {log:?}"
    );
    let mut distinct: Vec<i32> = Vec::new();
    for &key in input {
        if !distinct.contains(&key) {
            distinct.push(key);
        }
    }
    let inserts: Vec<String> = distinct.iter().map(|k| format!("Insert({k})")).collect();
    for prefix in ["bst:", "avl:"] {
        let got: Vec<String> = tree_log(&log, prefix)
            .into_iter()
            .filter(|entry| entry.starts_with("Insert"))
            .collect();
        assert_eq!(
            got, inserts,
            "{ctx}: {prefix} Insert steps should add each distinct key once, in slot order; log {log:?}"
        );
    }
}

#[test]
fn template_id() {
    assert_eq!(
        UpsetBstBeatsAvl::ID,
        "upset-bst-beats-avl",
        "UpsetBstBeatsAvl::ID should be \"upset-bst-beats-avl\", got {:?}",
        UpsetBstBeatsAvl::ID
    );
}

#[test]
fn ties_are_unsolved() {
    check(&free(&[]), &[], 0, 0, 0);
    check(&free(&[42]), &[42], 0, 0, 0);
    check(&free(&[1, 2]), &[1, 2], 1, 1, 0);
    check(&free(&[1, 2, 3]), &[3, 1, 2], 3, 3, 2);
}

#[test]
fn exact_logs_for_three_sorted_keys() {
    let instance = free(&[1, 2, 3]);
    let log = log_of(&instance, &[1, 2, 3]);
    let walk = [
        "Insert(1)",
        "Visit(2 at 1)",
        "Insert(2)",
        "Visit(3 at 1)",
        "Visit(3 at 2)",
        "Insert(3)",
    ];
    let mut avl: Vec<&str> = walk.to_vec();
    avl.push("RotateLeft(1)");
    let ctx = call(&instance, &[1, 2, 3]);
    assert_eq!(
        tree_log(&log, "bst:"),
        walk,
        "{ctx}: BST steps should visit each existing node on the way down; full log {log:?}"
    );
    assert_eq!(
        tree_log(&log, "avl:"),
        avl,
        "{ctx}: AVL steps should match the BST's, then rotate left at 1 (RR); full log {log:?}"
    );
    check(&instance, &[1, 2, 3], 3, 3, 1);
}

#[test]
fn sorted_keys_make_the_bst_pass_more() {
    let up: Vec<i32> = (1..=7).collect();
    check(&free(&up), &up, 21, 14, 4);
    let down: Vec<i32> = (1..=7).rev().collect();
    check(&free(&up), &down, 21, 14, 4);
}

#[test]
fn small_upsets() {
    // AVL rotates at 2 after 4, so 1 passes 3 and 2 there but only 2 in the BST.
    check(&free(&[1, 2, 3, 4]), &[2, 3, 4, 1], 4, 5, 1);
    check(&free(&[1, 2, 3, 4, 5]), &[3, 1, 2, 4, 5], 6, 8, 3);
}

#[test]
fn duplicates_pass_the_equal_node_and_stop() {
    check(&free(&[1, 1, 2, 2]), &[2, 1, 2, 1], 4, 4, 0);
    let instance = free(&[1, 1, 2, 2]);
    let log = log_of(&instance, &[2, 1, 2, 1]);
    assert_eq!(
        tree_log(&log, "bst:"),
        [
            "Insert(2)",
            "Visit(1 at 2)",
            "Insert(1)",
            "Visit(2 at 2)",
            "Visit(1 at 2)",
            "Visit(1 at 1)"
        ],
        "{}: a duplicate key visits the nodes down to its equal key (counting it), then stops without an Insert; full log {log:?}",
        call(&instance, &[2, 1, 2, 1])
    );
}

#[test]
fn upset_25_arrangements() {
    let puzzle = upset_25();
    // start: BST 42 >= AVL 38, unsolved.
    check(
        &puzzle,
        &[3, 2, 13, 6, 14, 1, 8, 10, 5, 12, 11, 7, 4, 9],
        42,
        38,
        6,
    );
    // solved: BST 37 < AVL 41, margin 4. Counting the 11 rotations would wrongly give AVL 52.
    check(
        &puzzle,
        &[3, 2, 8, 13, 14, 1, 10, 9, 6, 12, 11, 7, 4, 5],
        37,
        41,
        11,
    );
}

#[test]
fn input_errors_come_in_order_and_agree() {
    let base = inst(&[4, 1, 3, 2, 5], &[3, 1]);
    let wl = |got| InputError::WrongLength { expected: 5, got };
    let fm = |index| InputError::FixedValueMoved { index };
    let cases: [(&str, &[i32], InputError); 7] = [
        ("too short", &[4, 1, 3, 2], wl(4)),
        ("too long", &[4, 1, 3, 2, 5, 6], wl(6)),
        ("wrong length beats everything", &[9, 9], wl(2)),
        ("fixed slot 3 moved", &[4, 1, 2, 3, 5], fm(3)),
        ("fixed slots 1 and 3 moved", &[4, 2, 3, 1, 5], fm(1)),
        (
            "fixed moved beats not-a-permutation",
            &[4, 9, 3, 2, 5],
            fm(1),
        ),
        (
            "value not in the puzzle",
            &[9, 1, 3, 2, 5],
            InputError::NotAPermutation,
        ),
    ];
    for (label, input, expected) in cases {
        let ctx = format!("{} ({label})", call(&base, input));
        let input = input.to_vec();
        assert_eq!(
            UpsetBstBeatsAvl.run(&base, &input).err(),
            Some(expected.clone()),
            "{ctx}: run should fail with {expected:?}"
        );
        assert_eq!(
            UpsetBstBeatsAvl.score(&base, &input).err(),
            Some(expected.clone()),
            "{ctx}: score should fail with {expected:?}"
        );
        assert_eq!(
            UpsetBstBeatsAvl.evaluate(&base, &input).err(),
            Some(expected.clone()),
            "{ctx}: evaluate should fail with {expected:?}"
        );
    }
}

#[test]
fn rules_name_both_trees() {
    let rules = UpsetBstBeatsAvl.rules(&upset_25());
    for needle in ["BST", "AVL"] {
        assert!(
            rules.contains(needle),
            "UpsetBstBeatsAvl.rules should mention {needle:?} (as written, upper case), got {rules:?}"
        );
    }
}
