use structs_puzzles::bst_forced_order::{BstForcedOrder, Instance, Step};
use structs_puzzles::{InputError, Template};

// Runs, trees and visit counts are worked by hand from `GraphicalBST.ts`'s insert (duplicates are
// compared against and then dropped) and match `e2e/support/daily-tree-fixtures.ts`.

fn inst(values: &[i32], target_tree: &[i32]) -> Instance {
    Instance {
        values: values.to_vec(),
        target_tree: target_tree.to_vec(),
    }
}

/// Puzzle #24: 6(3(1( , 2), 5(4, )), 9(7( , 8), 10)).
const FORCED_24_TARGET: [i32; 10] = [6, 3, 1, 2, 5, 4, 9, 7, 8, 10];

fn forced_24() -> Instance {
    inst(&[3, 6, 9, 1, 2, 5, 4, 7, 8, 10], &FORCED_24_TARGET)
}

fn call(instance: &Instance, input: &[i32]) -> String {
    format!(
        "BstForcedOrder on values {:?}, target_tree {:?} with input {input:?}",
        instance.values, instance.target_tree
    )
}

fn describe(step: &Step) -> String {
    match step {
        Step::Visit { key, existing } => format!("Visit({key} at {existing})"),
        Step::Insert { key } => format!("Insert({key})"),
    }
}

struct Expect<'a> {
    run: u32,
    solved: bool,
    preorder: &'a [i32],
    visits: usize,
}

fn check(instance: &Instance, input: &[i32], want: Expect) {
    let ctx = call(instance, input);
    let outcome = BstForcedOrder
        .evaluate(instance, input)
        .unwrap_or_else(|e| panic!("{ctx}: evaluate returned error {e:?}"));
    assert_eq!(
        outcome.longest_increasing_run, want.run,
        "{ctx}: evaluate().longest_increasing_run (longest run of neighbours with a[i] < a[i + 1]) should be {}, got {}",
        want.run, outcome.longest_increasing_run
    );
    assert_eq!(
        outcome.preorder, want.preorder,
        "{ctx}: evaluate().preorder should be the preorder of the BST built by inserting the input in slot order"
    );
    assert_eq!(
        outcome.solved, want.solved,
        "{ctx}: evaluate().solved should be {} (preorder {:?} vs target {:?}), got {}",
        want.solved, outcome.preorder, instance.target_tree, outcome.solved
    );
    let expected_score = if want.solved { want.run } else { 0 };
    let score = BstForcedOrder
        .score(instance, &input.to_vec())
        .unwrap_or_else(|e| panic!("{ctx}: score returned error {e:?}"));
    assert_eq!(
        score, expected_score,
        "{ctx}: score should be {expected_score} (the increasing run when solved, 0 when unsolved), got {score}"
    );
    let steps = BstForcedOrder
        .run(instance, &input.to_vec())
        .unwrap_or_else(|e| panic!("{ctx}: run returned error {e:?}"));
    let log: Vec<String> = steps.iter().map(describe).collect();
    let visits = steps
        .iter()
        .filter(|step| matches!(step, Step::Visit { .. }))
        .count();
    assert_eq!(
        visits, want.visits,
        "{ctx}: run should log {} Visit steps (existing nodes passed on the way down), got {visits}; log {log:?}",
        want.visits
    );
    let mut inserted: Vec<i32> = Vec::new();
    for step in &steps {
        if let Step::Insert { key } = *step {
            inserted.push(key);
        }
    }
    let mut distinct: Vec<i32> = Vec::new();
    for &key in input {
        if !distinct.contains(&key) {
            distinct.push(key);
        }
    }
    assert_eq!(
        inserted, distinct,
        "{ctx}: Insert steps should add each distinct key once, in slot order; log {log:?}"
    );
}

#[test]
fn template_id() {
    assert_eq!(
        BstForcedOrder::ID,
        "bst-forced-order",
        "BstForcedOrder::ID should be \"bst-forced-order\", got {:?}",
        BstForcedOrder::ID
    );
}

#[test]
fn empty_and_single_key() {
    let empty = Expect {
        run: 0,
        solved: true,
        preorder: &[],
        visits: 0,
    };
    check(&inst(&[], &[]), &[], empty);
    let single = Expect {
        run: 1,
        solved: true,
        preorder: &[7],
        visits: 0,
    };
    check(&inst(&[7], &[7]), &[7], single);
    let other = Expect {
        run: 1,
        solved: false,
        preorder: &[7],
        visits: 0,
    };
    check(&inst(&[7], &[8]), &[7], other);
}

#[test]
fn exact_log_for_three_keys() {
    let instance = inst(&[1, 2, 3], &[2, 1, 3]);
    let log: Vec<String> = BstForcedOrder
        .run(&instance, &vec![2, 3, 1])
        .unwrap_or_else(|e| panic!("{}: run returned error {e:?}", call(&instance, &[2, 3, 1])))
        .iter()
        .map(describe)
        .collect();
    assert_eq!(
        log,
        [
            "Insert(2)",
            "Visit(3 at 2)",
            "Insert(3)",
            "Visit(1 at 2)",
            "Insert(1)"
        ],
        "{}: each insert visits the existing nodes on its way down, then inserts",
        call(&instance, &[2, 3, 1])
    );
}

#[test]
fn runs_count_strictly_increasing_neighbours() {
    let decreasing = Expect {
        run: 1,
        solved: true,
        preorder: &[5, 4, 3, 2, 1],
        visits: 10,
    };
    check(
        &inst(&[1, 2, 3, 4, 5], &[5, 4, 3, 2, 1]),
        &[5, 4, 3, 2, 1],
        decreasing,
    );
    let middle = Expect {
        run: 4,
        solved: false,
        preorder: &[3, 1, 2, 4, 5],
        visits: 6,
    };
    check(
        &inst(&[1, 2, 3, 4, 5], &[3, 1, 4, 2, 5]),
        &[3, 1, 2, 4, 5],
        middle,
    );
    // Equal neighbours break a run, and the duplicate 2 is not inserted again.
    let equal = Expect {
        run: 2,
        solved: true,
        preorder: &[1, 2, 3],
        visits: 5,
    };
    check(&inst(&[1, 2, 2, 3], &[1, 2, 3]), &[1, 2, 2, 3], equal);
}

#[test]
fn same_keys_in_a_different_shape_is_unsolved() {
    let instance = inst(&[1, 2, 3], &[2, 1, 3]);
    let chain = Expect {
        run: 3,
        solved: false,
        preorder: &[1, 2, 3],
        visits: 3,
    };
    check(&instance, &[1, 2, 3], chain);
    let balanced = Expect {
        run: 2,
        solved: true,
        preorder: &[2, 1, 3],
        visits: 2,
    };
    check(&instance, &[2, 3, 1], balanced);
}

#[test]
fn forced_24_arrangements() {
    let puzzle = forced_24();
    let start = Expect {
        run: 4,
        solved: false,
        preorder: &[3, 1, 2, 6, 5, 4, 9, 7, 8, 10],
        visits: 21,
    };
    check(&puzzle, &[3, 6, 9, 1, 2, 5, 4, 7, 8, 10], start);
    let solved = Expect {
        run: 6,
        solved: true,
        preorder: &FORCED_24_TARGET,
        visits: 19,
    };
    check(&puzzle, &[6, 3, 9, 5, 1, 2, 4, 7, 8, 10], solved);
    let long_run = Expect {
        run: 7,
        solved: false,
        preorder: &[6, 3, 1, 2, 4, 5, 9, 7, 8, 10],
        visits: 19,
    };
    check(&puzzle, &[6, 9, 3, 1, 2, 4, 5, 7, 8, 10], long_run);
    let ascending = Expect {
        run: 10,
        solved: false,
        preorder: &[1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        visits: 45,
    };
    check(&puzzle, &[1, 2, 3, 4, 5, 6, 7, 8, 9, 10], ascending);
}

#[test]
fn input_errors_come_in_order_and_agree() {
    let base = inst(&[4, 1, 3, 2, 5], &[4, 1, 3, 2, 5]);
    let wl = |got| InputError::WrongLength { expected: 5, got };
    let cases: [(&str, &[i32], InputError); 5] = [
        ("too short", &[4, 1, 3, 2], wl(4)),
        ("too long", &[4, 1, 3, 2, 5, 6], wl(6)),
        ("wrong length beats everything", &[9, 9], wl(2)),
        (
            "value not in the puzzle",
            &[9, 1, 3, 2, 5],
            InputError::NotAPermutation,
        ),
        (
            "duplicate value",
            &[4, 1, 4, 2, 5],
            InputError::NotAPermutation,
        ),
    ];
    for (label, input, expected) in cases {
        let ctx = format!("{} ({label})", call(&base, input));
        let input = input.to_vec();
        assert_eq!(
            BstForcedOrder.run(&base, &input).err(),
            Some(expected.clone()),
            "{ctx}: run should fail with {expected:?}"
        );
        assert_eq!(
            BstForcedOrder.score(&base, &input).err(),
            Some(expected.clone()),
            "{ctx}: score should fail with {expected:?}"
        );
        assert_eq!(
            BstForcedOrder.evaluate(&base, &input).err(),
            Some(expected.clone()),
            "{ctx}: evaluate should fail with {expected:?}"
        );
    }
}

#[test]
fn rules_mention_the_target_tree() {
    let rules = BstForcedOrder.rules(&forced_24()).to_lowercase();
    assert!(
        rules.contains("target tree"),
        "BstForcedOrder.rules should mention \"target tree\" (case-insensitive), got {rules:?}"
    );
}
