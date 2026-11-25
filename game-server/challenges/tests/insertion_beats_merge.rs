use daily_challenges::insertion_beats_merge::{Algorithm, InsertionBeatsMerge, Instance, Step};
use daily_challenges::{InputError, Template};

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

fn insertion_22() -> Instance {
    inst(&[5, 3, 8, 1, 7, 2, 6, 4], &[1, 4])
}

fn call(instance: &Instance, input: &[i32]) -> String {
    format!(
        "InsertionBeatsMerge on values {:?}, fixed {:?} with input {input:?}",
        instance.values, instance.fixed
    )
}

fn describe(step: &Step) -> String {
    match step {
        Step::Compare {
            algorithm: Algorithm::Insertion,
        } => "Compare(insertion)".to_owned(),
        Step::Compare {
            algorithm: Algorithm::Merge,
        } => "Compare(merge)".to_owned(),
        Step::Swap { left, right } => format!("Swap({left},{right})"),
    }
}

fn check(instance: &Instance, input: &[i32], insertion: u32, merge: u32, inversions: u32) {
    let ctx = call(instance, input);
    let solved = insertion < merge;
    let outcome = InsertionBeatsMerge
        .evaluate(instance, input)
        .unwrap_or_else(|e| panic!("{ctx}: evaluate returned error {e:?}"));
    assert_eq!(
        outcome.insertion_comparisons, insertion,
        "{ctx}: evaluate().insertion_comparisons (each `val >= a[j - 1]` check) should be {insertion}, got {}",
        outcome.insertion_comparisons
    );
    assert_eq!(
        outcome.merge_comparisons, merge,
        "{ctx}: evaluate().merge_comparisons (each `a[left] <= a[right]` check) should be {merge}, got {}",
        outcome.merge_comparisons
    );
    assert_eq!(
        outcome.inversions, inversions,
        "{ctx}: evaluate().inversions (out-of-order pairs = insertion swaps) should be {inversions}, got {}",
        outcome.inversions
    );
    assert_eq!(
        outcome.solved, solved,
        "{ctx}: evaluate().solved should be {solved} (insertion {insertion} < merge {merge}, strictly), got {}",
        outcome.solved
    );
    let expected_score = if solved { inversions } else { 0 };
    let score = InsertionBeatsMerge
        .score(instance, &input.to_vec())
        .unwrap_or_else(|e| panic!("{ctx}: score returned error {e:?}"));
    assert_eq!(
        score, expected_score,
        "{ctx}: score should be {expected_score} (inversions when solved, 0 when unsolved), got {score}"
    );
    check_log(instance, input, insertion, merge, inversions);
}

fn check_log(instance: &Instance, input: &[i32], insertion: u32, merge: u32, inversions: u32) {
    let ctx = call(instance, input);
    let steps = InsertionBeatsMerge
        .run(instance, &input.to_vec())
        .unwrap_or_else(|e| panic!("{ctx}: run returned error {e:?}"));
    let log: Vec<String> = steps.iter().map(describe).collect();
    let mut arr = input.to_vec();
    let (mut ins, mut mer, mut swaps) = (0u32, 0u32, 0u32);
    for (index, step) in steps.iter().enumerate() {
        match *step {
            Step::Compare {
                algorithm: Algorithm::Insertion,
            } => ins += 1,
            Step::Compare {
                algorithm: Algorithm::Merge,
            } => mer += 1,
            Step::Swap { left, right } => {
                assert!(
                    right == left + 1 && right < arr.len(),
                    "{ctx}: step #{index} {} should swap adjacent slots inside the array; log {log:?}",
                    describe(step)
                );
                arr.swap(left, right);
                swaps += 1;
            }
        }
    }
    assert_eq!(
        ins, insertion,
        "{ctx}: run should log {insertion} Compare(insertion) steps, got {ins}; log {log:?}"
    );
    assert_eq!(
        mer, merge,
        "{ctx}: run should log {merge} Compare(merge) steps, got {mer}; log {log:?}"
    );
    assert_eq!(
        swaps, inversions,
        "{ctx}: run should log {inversions} Swap steps (insertion's swaps), got {swaps}; log {log:?}"
    );
    let mut sorted = input.to_vec();
    sorted.sort_unstable();
    assert_eq!(
        arr, sorted,
        "{ctx}: applying every Swap step in order should sort the input; log {log:?}"
    );
}

#[test]
fn template_id() {
    assert_eq!(
        InsertionBeatsMerge::ID,
        "insertion-beats-merge",
        "InsertionBeatsMerge::ID should be \"insertion-beats-merge\", got {:?}",
        InsertionBeatsMerge::ID
    );
}

#[test]
fn empty_and_single_value_compare_nothing_and_tie_unsolved() {
    for values in [&[][..], &[42][..]] {
        check(&free(values), values, 0, 0, 0);
        let steps = InsertionBeatsMerge
            .run(&free(values), &values.to_vec())
            .unwrap_or_default();
        assert!(
            steps.is_empty(),
            "{}: n <= 1 should log no steps, got {} steps",
            call(&free(values), values),
            steps.len()
        );
    }
}

#[test]
fn sorted_input_favours_insertion() {
    check(&free(&[1, 2, 3, 4, 5]), &[1, 2, 3, 4, 5], 4, 7, 0);
}

#[test]
fn reversed_input_favours_merge() {
    check(&free(&[1, 2, 3, 4]), &[4, 3, 2, 1], 6, 4, 6);
    check(&free(&[1, 2, 3, 4, 5]), &[5, 4, 3, 2, 1], 10, 5, 10);
}

#[test]
fn a_tie_is_unsolved() {
    check(&free(&[1, 2]), &[2, 1], 1, 1, 1);
    check(&free(&[1, 2, 3]), &[3, 1, 2], 3, 3, 2);
}

#[test]
fn insertion_22_arrangements() {
    let challenge = insertion_22();
    check(&challenge, &[5, 3, 8, 1, 7, 2, 6, 4], 20, 17, 15);
    check(&challenge, &[5, 3, 1, 6, 7, 2, 8, 4], 16, 16, 11);
    check(&challenge, &[5, 3, 2, 6, 7, 1, 4, 8], 15, 16, 11);
    check(&challenge, &[5, 3, 2, 4, 7, 1, 6, 8], 14, 15, 10);
    check(&challenge, &[2, 3, 8, 1, 7, 4, 5, 6], 16, 17, 10);
}

#[test]
fn insertion_stops_on_equal_values() {
    check(&free(&[2, 2]), &[2, 2], 1, 1, 0);
    check(&free(&[1, 2, 2]), &[1, 2, 2], 2, 3, 0);
    check(&free(&[7, 7, 7]), &[7, 7, 7], 2, 3, 0);
    check(&free(&[1, 1, 2, 2]), &[2, 2, 1, 1], 6, 4, 4);
}

#[test]
fn merge_takes_left_on_ties() {
    check(&free(&[1, 1, 2]), &[1, 2, 1], 3, 3, 1);
    check(&free(&[1, 1, 2, 3, 3]), &[3, 1, 2, 3, 1], 8, 8, 5);
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
        (
            "fixed slots 1 and 3 moved: smallest index wins",
            &[4, 2, 3, 1, 5],
            fm(1),
        ),
        (
            "fixed moved beats not-a-permutation",
            &[4, 9, 3, 2, 5],
            fm(1),
        ),
        (
            "value not in the challenge",
            &[9, 1, 3, 2, 5],
            InputError::NotAPermutation,
        ),
    ];
    for (label, input, expected) in cases {
        let ctx = format!("{} ({label})", call(&base, input));
        let input = input.to_vec();
        assert_eq!(
            InsertionBeatsMerge.run(&base, &input).err(),
            Some(expected.clone()),
            "{ctx}: run should fail with {expected:?}"
        );
        assert_eq!(
            InsertionBeatsMerge.score(&base, &input).err(),
            Some(expected.clone()),
            "{ctx}: score should fail with {expected:?}"
        );
        assert_eq!(
            InsertionBeatsMerge.evaluate(&base, &input).err(),
            Some(expected.clone()),
            "{ctx}: evaluate should fail with {expected:?}"
        );
    }
}

#[test]
fn rules_name_both_sorts() {
    let rules = InsertionBeatsMerge.rules(&insertion_22()).to_lowercase();
    for needle in ["insertion sort", "merge sort"] {
        assert!(
            rules.contains(needle),
            "InsertionBeatsMerge.rules should mention {needle:?} (case-insensitive), got {rules:?}"
        );
    }
}
