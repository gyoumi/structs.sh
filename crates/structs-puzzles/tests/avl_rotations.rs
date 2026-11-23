use structs_puzzles::avl_rotations::{AvlRotations, Instance, Step};
use structs_puzzles::{InputError, Template};

// Counts are worked by hand from `GraphicalAVL.ts`'s insert (LL and RR count 1 rotation, LR and
// RL count 2, duplicates are compared against and then dropped) and match
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

fn avl_23() -> Instance {
    inst(&[5, 1, 3, 8, 6, 7, 2, 4], &[0, 5])
}

fn call(instance: &Instance, input: &[i32]) -> String {
    format!(
        "AvlRotations on values {:?}, fixed {:?} with input {input:?}",
        instance.values, instance.fixed
    )
}

fn describe(step: &Step) -> String {
    match step {
        Step::Visit { key, existing } => format!("Visit({key} at {existing})"),
        Step::Insert { key } => format!("Insert({key})"),
        Step::RotateLeft { pivot } => format!("RotateLeft({pivot})"),
        Step::RotateRight { pivot } => format!("RotateRight({pivot})"),
    }
}

fn log_of(instance: &Instance, input: &[i32]) -> Vec<String> {
    AvlRotations
        .run(instance, &input.to_vec())
        .unwrap_or_else(|e| panic!("{}: run returned error {e:?}", call(instance, input)))
        .iter()
        .map(describe)
        .collect()
}

fn first_occurrences(input: &[i32]) -> Vec<i32> {
    let mut seen = Vec::new();
    for &key in input {
        if !seen.contains(&key) {
            seen.push(key);
        }
    }
    seen
}

fn check(instance: &Instance, input: &[i32], rotations: u32) {
    let ctx = call(instance, input);
    let outcome = AvlRotations
        .evaluate(instance, input)
        .unwrap_or_else(|e| panic!("{ctx}: evaluate returned error {e:?}"));
    assert_eq!(
        outcome.rotations, rotations,
        "{ctx}: evaluate().rotations (single rotations; LL/RR = 1, LR/RL = 2) should be {rotations}, got {}",
        outcome.rotations
    );
    let score = AvlRotations
        .score(instance, &input.to_vec())
        .unwrap_or_else(|e| panic!("{ctx}: score returned error {e:?}"));
    assert_eq!(
        score, rotations,
        "{ctx}: score should be the {rotations} rotations (avl-most-rotations is always solved), got {score}"
    );
    let steps = AvlRotations
        .run(instance, &input.to_vec())
        .unwrap_or_else(|e| panic!("{ctx}: run returned error {e:?}"));
    let log: Vec<String> = steps.iter().map(describe).collect();
    let rotate_steps = steps
        .iter()
        .filter(|step| matches!(step, Step::RotateLeft { .. } | Step::RotateRight { .. }))
        .count();
    assert_eq!(
        rotate_steps, rotations as usize,
        "{ctx}: run should log one RotateLeft/RotateRight step per counted rotation ({rotations}), got {rotate_steps}; log {log:?}"
    );
    let mut inserted: Vec<i32> = Vec::new();
    for (index, step) in steps.iter().enumerate() {
        match *step {
            Step::Insert { key } => inserted.push(key),
            Step::Visit { existing: k, .. }
            | Step::RotateLeft { pivot: k }
            | Step::RotateRight { pivot: k } => assert!(
                inserted.contains(&k),
                "{ctx}: step #{index} {} names key {k}, which no earlier Insert step added; log {log:?}",
                describe(step)
            ),
        }
    }
    assert_eq!(
        inserted,
        first_occurrences(input),
        "{ctx}: Insert steps should add each distinct key once, in slot order (duplicates are dropped); log {log:?}"
    );
}

#[test]
fn template_id() {
    assert_eq!(
        AvlRotations::ID,
        "avl-most-rotations",
        "AvlRotations::ID should be \"avl-most-rotations\", got {:?}",
        AvlRotations::ID
    );
}

#[test]
fn up_to_two_keys_never_rotate() {
    for values in [&[][..], &[42][..], &[1, 2][..], &[2, 1][..]] {
        check(&free(values), values, 0);
    }
    assert!(
        log_of(&free(&[]), &[]).is_empty(),
        "AvlRotations on [] should log no steps"
    );
}

#[test]
fn single_rotations_count_one() {
    check(&free(&[1, 2, 3]), &[3, 2, 1], 1);
    check(&free(&[1, 2, 3]), &[1, 2, 3], 1);
}

#[test]
fn double_rotations_count_two() {
    check(&free(&[1, 2, 3]), &[3, 1, 2], 2);
    check(&free(&[1, 2, 3]), &[1, 3, 2], 2);
}

/// `pivot` is the key at the top of the rotated subtree before the rotation (the node that moves
/// down), as in `GraphicalAVL`'s `rotateLeft(parent, node)`.
#[test]
fn exact_logs_for_the_four_cases() {
    let cases: [(&str, [i32; 3], &[&str]); 4] = [
        ("LL", [3, 2, 1], &["RotateRight(3)"]),
        ("RR", [1, 2, 3], &["RotateLeft(1)"]),
        ("LR", [3, 1, 2], &["RotateLeft(1)", "RotateRight(3)"]),
        ("RL", [1, 3, 2], &["RotateRight(3)", "RotateLeft(1)"]),
    ];
    for (case, input, rotations) in cases {
        let [a, b, c] = input;
        let mut expected = vec![
            format!("Insert({a})"),
            format!("Visit({b} at {a})"),
            format!("Insert({b})"),
            format!("Visit({c} at {a})"),
            format!("Visit({c} at {b})"),
            format!("Insert({c})"),
        ];
        expected.extend(rotations.iter().map(|r| (*r).to_owned()));
        let log = log_of(&free(&input), &input);
        assert_eq!(
            log,
            expected,
            "{} ({case} case): each insert visits the existing nodes on its way down, then rotations follow on the way back up",
            call(&free(&input), &input)
        );
    }
}

#[test]
fn sorted_and_reversed_runs() {
    let up: Vec<i32> = (1..=7).collect();
    let down: Vec<i32> = (1..=7).rev().collect();
    check(&free(&up), &up, 4);
    check(&free(&up), &down, 4);
    let up10: Vec<i32> = (1..=10).collect();
    check(&free(&up10), &up10, 6);
}

#[test]
fn duplicate_keys_are_ignored() {
    check(&free(&[1, 2, 2]), &[1, 2, 2], 0);
    check(&free(&[1, 2, 2, 3]), &[1, 2, 2, 3], 1);
    check(&free(&[1, 2, 2, 3, 3]), &[3, 3, 2, 2, 1], 1);
    check(&free(&[1, 1, 2, 2]), &[2, 1, 2, 1], 0);
    let instance = free(&[1, 1, 2, 2]);
    assert_eq!(
        log_of(&instance, &[2, 1, 2, 1]),
        [
            "Insert(2)",
            "Visit(1 at 2)",
            "Insert(1)",
            "Visit(2 at 2)",
            "Visit(1 at 2)",
            "Visit(1 at 1)"
        ],
        "{}: a duplicate key visits the nodes down to its equal key, then stops without an Insert",
        call(&instance, &[2, 1, 2, 1])
    );
}

#[test]
fn avl_23_arrangements() {
    let puzzle = avl_23();
    // start: LR at 5 (2), RL at 5 (2), RR at 3 (1).
    check(&puzzle, &[5, 1, 3, 8, 6, 7, 2, 4], 5);
    // doubles: LR at 5 (2), RL at 5 (2), RR at 2 (1), LR at 5 (2).
    check(&puzzle, &[5, 1, 2, 8, 6, 7, 3, 4], 7);
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
            "duplicate value",
            &[4, 1, 4, 2, 5],
            InputError::NotAPermutation,
        ),
    ];
    for (label, input, expected) in cases {
        let ctx = format!("{} ({label})", call(&base, input));
        let input = input.to_vec();
        assert_eq!(
            AvlRotations.run(&base, &input).err(),
            Some(expected.clone()),
            "{ctx}: run should fail with {expected:?}"
        );
        assert_eq!(
            AvlRotations.score(&base, &input).err(),
            Some(expected.clone()),
            "{ctx}: score should fail with {expected:?}"
        );
        assert_eq!(
            AvlRotations.evaluate(&base, &input).err(),
            Some(expected.clone()),
            "{ctx}: evaluate should fail with {expected:?}"
        );
    }
}

#[test]
fn rules_mention_rotations() {
    let rules = AvlRotations.rules(&avl_23()).to_lowercase();
    assert!(
        rules.contains("rotations"),
        "AvlRotations.rules should mention \"rotations\" (case-insensitive), got {rules:?}"
    );
}
