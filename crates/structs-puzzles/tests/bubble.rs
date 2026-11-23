use structs_puzzles::bubble::{Bubble, Instance, Step};
use structs_puzzles::{InputError, Template};

fn inst(values: &[i32], fixed: &[usize], target_passes: u32) -> Instance {
    Instance {
        values: values.to_vec(),
        fixed: fixed.to_vec(),
        target_passes,
    }
}

fn bubble_21() -> Instance {
    inst(&[6, 2, 8, 1, 5, 3, 7, 4], &[1, 4, 6], 4)
}

fn call(instance: &Instance, input: &[i32]) -> String {
    format!(
        "Bubble on values {:?}, fixed {:?}, target_passes {} with input {input:?}",
        instance.values, instance.fixed, instance.target_passes
    )
}

fn describe(step: &Step) -> String {
    match step {
        Step::Compare { left, right } => format!("Compare({left},{right})"),
        Step::Swap { left, right } => format!("Swap({left},{right})"),
        Step::PassEnd { pass, swaps } => format!("PassEnd(pass {pass}, swaps {swaps})"),
    }
}

fn run_ok(instance: &Instance, input: &[i32]) -> Vec<Step> {
    Bubble
        .run(instance, &input.to_vec())
        .unwrap_or_else(|e| panic!("{}: run returned error {e:?}", call(instance, input)))
}

fn check(instance: &Instance, input: &[i32], passes: u32, swaps: u32, solved: bool) {
    let ctx = call(instance, input);
    let outcome = Bubble
        .evaluate(instance, &input.to_vec())
        .unwrap_or_else(|e| panic!("{ctx}: evaluate returned error {e:?}"));
    assert_eq!(
        outcome.passes, passes,
        "{ctx}: evaluate().passes should be {passes}, got {}",
        outcome.passes
    );
    assert_eq!(
        outcome.swaps, swaps,
        "{ctx}: evaluate().swaps should be {swaps}, got {}",
        outcome.swaps
    );
    assert_eq!(
        outcome.solved, solved,
        "{ctx}: evaluate().solved should be {solved} (passes {} vs target {}), got {}",
        outcome.passes, instance.target_passes, outcome.solved
    );
    let expected_score = if solved { swaps } else { 0 };
    let score = Bubble
        .score(instance, &input.to_vec())
        .unwrap_or_else(|e| panic!("{ctx}: score returned error {e:?}"));
    assert_eq!(
        score, expected_score,
        "{ctx}: score should be {expected_score} (swaps when solved, 0 when unsolved), got {score}"
    );
    check_log(instance, input, passes, swaps);
}

fn check_log(instance: &Instance, input: &[i32], passes: u32, swaps: u32) {
    let ctx = call(instance, input);
    let steps = run_ok(instance, input);
    let log: Vec<String> = steps.iter().map(describe).collect();
    let n = input.len();
    let mut arr = input.to_vec();
    let mut compares = 0usize;
    let mut swaps_seen = 0u32;
    let mut swaps_this_pass = 0u32;
    let mut pass_ends: Vec<(u32, u32)> = Vec::new();
    let mut last: Option<(usize, usize)> = None;
    for (index, step) in steps.iter().enumerate() {
        match *step {
            Step::Compare { left, right } => {
                assert!(
                    right == left + 1 && right < n,
                    "{ctx}: step #{index} {} should compare adjacent slots inside the array; log {log:?}",
                    describe(step)
                );
                compares += 1;
                last = Some((left, right));
            }
            Step::Swap { left, right } => {
                assert_eq!(
                    last,
                    Some((left, right)),
                    "{ctx}: step #{index} {} should directly follow Compare({left},{right}); log {log:?}",
                    describe(step)
                );
                arr.swap(left, right);
                swaps_seen += 1;
                swaps_this_pass += 1;
                last = None;
            }
            Step::PassEnd { pass, swaps } => {
                assert_eq!(
                    swaps,
                    swaps_this_pass,
                    "{ctx}: step #{index} {} should report the {swaps_this_pass} Swap steps since the previous PassEnd; log {log:?}",
                    describe(step)
                );
                pass_ends.push((pass, swaps));
                swaps_this_pass = 0;
                last = None;
            }
        }
    }
    let mut sorted = input.to_vec();
    sorted.sort_unstable();
    assert_eq!(
        arr, sorted,
        "{ctx}: applying every Swap step in order should sort the input; log {log:?}"
    );
    assert_eq!(
        swaps_seen, swaps,
        "{ctx}: run should log {swaps} Swap steps, got {swaps_seen}; log {log:?}"
    );
    assert_eq!(
        pass_ends.len(),
        passes as usize,
        "{ctx}: run should log one PassEnd per pass ({passes}), got {}; log {log:?}",
        pass_ends.len()
    );
    let expected_compares: usize = (0..passes as usize).map(|i| n - 1 - i).sum();
    assert_eq!(
        compares, expected_compares,
        "{ctx}: pass i compares n - 1 - i pairs, so {passes} passes over {n} values log {expected_compares} Compare steps, got {compares}; log {log:?}"
    );
    let consecutive = pass_ends.windows(2).all(|pair| pair[1].0 == pair[0].0 + 1);
    assert!(
        consecutive,
        "{ctx}: PassEnd pass numbers should go up by one each pass, got {pass_ends:?}; log {log:?}"
    );
    assert_eq!(
        steps
            .last()
            .map(|step| matches!(step, Step::PassEnd { .. })),
        if passes == 0 { None } else { Some(true) },
        "{ctx}: the log should end with a PassEnd (or be empty when there are no passes); log {log:?}"
    );
}

fn free(values: &[i32], target_passes: u32) -> Instance {
    inst(values, &[], target_passes)
}

#[test]
fn template_id() {
    assert_eq!(
        Bubble::ID,
        "bubble-exact-passes",
        "Bubble::ID should be \"bubble-exact-passes\", got {:?}",
        Bubble::ID
    );
}

#[test]
fn empty_and_single_value_make_no_passes() {
    for values in [&[][..], &[42][..]] {
        check(&free(values, 0), values, 0, 0, true);
        check(&free(values, 1), values, 0, 0, false);
    }
}

#[test]
fn already_sorted_takes_one_pass_with_no_swaps() {
    check(&free(&[1, 2, 3, 4, 5], 1), &[1, 2, 3, 4, 5], 1, 0, true);
    check(&free(&[1, 2, 3, 4, 5], 2), &[1, 2, 3, 4, 5], 1, 0, false);
}

#[test]
fn two_values_reversed_take_one_pass_and_one_swap() {
    check(&free(&[1, 2], 1), &[2, 1], 1, 1, true);
}

#[test]
fn exact_log_for_three_values() {
    let instance = free(&[1, 2, 3], 2);
    let log: Vec<String> = run_ok(&instance, &[3, 1, 2]).iter().map(describe).collect();
    let shape: Vec<String> = log
        .iter()
        .map(|entry| entry.split("(pass").next().unwrap_or(entry).to_owned())
        .collect();
    assert_eq!(
        shape,
        [
            "Compare(0,1)",
            "Swap(0,1)",
            "Compare(1,2)",
            "Swap(1,2)",
            "PassEnd",
            "Compare(0,1)",
            "PassEnd"
        ],
        "{}: hand trace is pass 1 [3,1,2] -> [1,3,2] -> [1,2,3] with 2 swaps, then pass 2 compares (0,1) only and swaps nothing; full log {log:?}",
        call(&instance, &[3, 1, 2])
    );
    check(&instance, &[3, 1, 2], 2, 2, true);
}

#[test]
fn reversed_stops_at_n_minus_one_passes_not_n() {
    let values = [1, 2, 3, 4, 5, 6, 7, 8];
    let reversed = [8, 7, 6, 5, 4, 3, 2, 1];
    check(&free(&values, 7), &reversed, 7, 28, true);
    check(&free(&values, 8), &reversed, 7, 28, false);
    check(&free(&values, 6), &reversed, 7, 28, false);
}

#[test]
fn duplicates_are_only_swapped_when_strictly_smaller() {
    check(&free(&[1, 1, 2, 2], 3), &[2, 2, 1, 1], 3, 4, true);
    check(&free(&[1, 1, 2, 3, 3], 4), &[3, 1, 2, 3, 1], 4, 5, true);
    check(&free(&[7, 7, 7], 1), &[7, 7, 7], 1, 0, true);
    check(&free(&[1, 3, 3], 2), &[3, 3, 1], 2, 2, true);
}

#[test]
fn bubble_21_arrangements() {
    let puzzle = bubble_21();
    check(&puzzle, &[6, 2, 8, 1, 5, 3, 7, 4], 5, 14, false);
    check(&puzzle, &[4, 2, 8, 1, 5, 3, 7, 6], 4, 11, true);
    check(&puzzle, &[8, 2, 6, 4, 5, 3, 7, 1], 7, 18, false);
    check(&puzzle, &[8, 2, 4, 1, 5, 3, 7, 6], 4, 12, true);
    check(&puzzle, &[1, 2, 4, 3, 5, 6, 7, 8], 2, 1, false);
    check(&puzzle, &[8, 2, 1, 3, 5, 4, 7, 6], 3, 10, false);
}

#[test]
fn input_errors_come_in_order_and_agree() {
    let base = inst(&[4, 1, 3, 2, 5], &[3, 1], 2);
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
            "duplicate value",
            &[4, 1, 4, 2, 5],
            InputError::NotAPermutation,
        ),
    ];
    for (label, input, expected) in cases {
        let ctx = format!("{} ({label})", call(&base, input));
        let input = input.to_vec();
        assert_eq!(
            Bubble.run(&base, &input).err(),
            Some(expected.clone()),
            "{ctx}: run should fail with {expected:?}"
        );
        assert_eq!(
            Bubble.score(&base, &input).err(),
            Some(expected.clone()),
            "{ctx}: score should fail with {expected:?}"
        );
        assert_eq!(
            Bubble.evaluate(&base, &input).err(),
            Some(expected.clone()),
            "{ctx}: evaluate should fail with {expected:?}"
        );
    }
}

#[test]
fn rules_name_the_target_and_swaps() {
    let puzzle = bubble_21();
    let rules = Bubble.rules(&puzzle).to_lowercase();
    for needle in ["4 passes", "swaps"] {
        assert!(
            rules.contains(needle),
            "Bubble.rules for target_passes 4 should mention {needle:?} (case-insensitive), got {rules:?}"
        );
    }
    let rules = Bubble.rules(&inst(&[3, 1, 2], &[], 2)).to_lowercase();
    assert!(
        rules.contains("2 passes"),
        "Bubble.rules for target_passes 2 should mention \"2 passes\", got {rules:?}"
    );
}
