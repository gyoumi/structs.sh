use daily_challenges::quicksort::{Instance, Quicksort, Step};
use daily_challenges::{InputError, Template};

const fn cmp(index: usize, pivot: i32) -> Step {
    Step::Compare { index, pivot }
}

const fn swp(i: usize, j: usize) -> Step {
    Step::Swap { i, j }
}

fn inst(values: &[i32], fixed: &[usize]) -> Instance {
    Instance {
        values: values.to_vec(),
        fixed: fixed.to_vec(),
    }
}

fn daily_12() -> Instance {
    inst(&[8, 1, 6, 3, 2, 7, 4, 5], &[1, 4, 6])
}

fn free(values: &[i32]) -> Instance {
    inst(values, &[])
}

fn run_ok(label: &str, instance: &Instance, input: &[i32]) -> Vec<Step> {
    Quicksort
        .run(instance, &input.to_vec())
        .unwrap_or_else(|e| panic!("run({input:?}) ({label}) returned error {e:?}"))
}

fn score_ok(label: &str, instance: &Instance, input: &[i32]) -> u32 {
    Quicksort
        .score(instance, &input.to_vec())
        .unwrap_or_else(|e| panic!("score({input:?}) ({label}) returned error {e:?}"))
}

fn assert_score_matches(
    label: &str,
    instance: &Instance,
    input: &[i32],
    expected: u32,
) -> Vec<Step> {
    let score = score_ok(label, instance, input);
    assert_eq!(
        score, expected,
        "score of {input:?} ({label}) should be {expected}"
    );
    let steps = run_ok(label, instance, input);
    assert_eq!(
        count_compares(&steps),
        expected,
        "Compare count in run({input:?}) ({label}) should be {expected}"
    );
    steps
}

fn count_compares(steps: &[Step]) -> u32 {
    steps
        .iter()
        .filter(|step| matches!(step, Step::Compare { .. }))
        .count() as u32
}

fn apply_swaps(input: &[i32], steps: &[Step]) -> Vec<i32> {
    let mut arr = input.to_vec();
    for &step in steps {
        if let Step::Swap { i, j } = step {
            assert!(
                i < arr.len() && j < arr.len(),
                "input {input:?}: Swap {{ i: {i}, j: {j} }} indices must be < len {}",
                arr.len()
            );
            arr.swap(i, j);
        }
    }
    arr
}

fn generate_permutations(values: &[i32]) -> Vec<Vec<i32>> {
    if values.len() <= 1 {
        return vec![values.to_vec()];
    }
    let mut result = Vec::new();
    for (idx, &val) in values.iter().enumerate() {
        let mut rest = Vec::with_capacity(values.len() - 1);
        rest.extend_from_slice(&values[..idx]);
        rest.extend_from_slice(&values[idx + 1..]);
        for mut perm in generate_permutations(&rest) {
            perm.insert(0, val);
            result.push(perm);
        }
    }
    result
}

fn assert_exact_steps(label: &str, input: &[i32], expected: &[Step], expected_score: u32) {
    let instance = free(input);
    let steps = run_ok(label, &instance, input);
    assert_eq!(
        steps, expected,
        "exact step log for {input:?} ({label}) should match hand trace"
    );
    let score = score_ok(label, &instance, input);
    assert_eq!(
        score, expected_score,
        "score of {input:?} ({label}) should be {expected_score}"
    );
}

fn assert_error_agrees(label: &str, instance: &Instance, input: &[i32], expected: InputError) {
    let vec_input = input.to_vec();
    assert_eq!(
        Quicksort.run(instance, &vec_input),
        Err(expected.clone()),
        "{label}: run({input:?}) on {instance:?} should return Err({expected:?})"
    );
    assert_eq!(
        Quicksort.score(instance, &vec_input),
        Err(expected.clone()),
        "{label}: score({input:?}) on {instance:?} should return Err({expected:?})"
    );
}

fn assert_partition_and_pivot_invariants(input: &[i32], steps: &[Step]) {
    let mut arr = input.to_vec();
    if arr.len() <= 1 {
        assert!(
            steps.is_empty(),
            "input {input:?}: length <= 1 must emit empty step log, got {steps:?}"
        );
        return;
    }

    // Pending quicksort(a, lo, hi) frames in LIFO order (left runs before right).
    let mut stack = vec![(0usize, arr.len() - 1)];
    let mut active: Option<(usize, usize, i32)> = None;

    for (step_idx, &step) in steps.iter().enumerate() {
        let (lo, hi, expected_pivot) = match active {
            Some(state) => state,
            None => {
                let (lo, hi) = stack.pop().unwrap_or_else(|| {
                    panic!(
                        "input {input:?}: unexpected step #{step_idx} ({step:?}) after all partitions finished"
                    )
                });
                let state = (lo, hi, arr[lo]);
                active = Some(state);
                state
            }
        };

        match step {
            Step::Compare { index, pivot } => {
                assert_eq!(
                    pivot, expected_pivot,
                    "input {input:?}: step #{step_idx} Compare in partition [{lo}..={hi}] should use pivot a[{lo}]={expected_pivot}, got {pivot}"
                );
                assert!(
                    index > lo && index <= hi,
                    "input {input:?}: step #{step_idx} Compare index {index} should be in ({lo}, {hi}]"
                );
            }
            Step::Swap { i, j } => {
                assert!(
                    i >= lo && i <= hi && j >= lo && j <= hi,
                    "input {input:?}: step #{step_idx} Swap {{ i: {i}, j: {j} }} should stay within partition [{lo}..={hi}]"
                );
                arr.swap(i, j);
                if i == lo {
                    // Final swap(a, lo, j) closes this partition; recurse left then right.
                    if j + 1 < hi {
                        stack.push((j + 1, hi));
                    }
                    if j > lo + 1 {
                        stack.push((lo, j - 1));
                    }
                    active = None;
                }
            }
        }
    }

    assert!(
        active.is_none() && stack.is_empty(),
        "input {input:?}: step log ended before all partitions completed (active={active:?}, remaining={stack:?})"
    );
}

// Hand recount of DAILY_12 start [8, 1, 6, 3, 2, 7, 4, 5]:
// - partition(0,7) v=8: i=1..=7 (7), j=7 (1), post a[7]<8 (1) => 9; swap(0,7) -> [5,1,6,3,2,7,4,8], p=7.
// - partition(0,6) v=5: iter1 i=1,2 (2), j=6 (1), swap(2,6) -> [5,1,4,3,2,7,6,8];
//   iter2 i=2..=5 (4), j=6,5 (2), post a[5]<5 (1) => 10; swap(0,4) -> [2,1,4,3,5,7,6,8], p=4.
// - partition(0,3) v=2: i=1,2 (2), j=3,2 (2), post a[2]<2 (1) => 5; swap(0,1) -> [1,2,4,3,5,7,6,8], p=1.
// - partition(2,3) [4,3] => 3; partition(5,6) [7,6] => 3. Total = 9 + 10 + 5 + 3 + 3 = 30.
//
// Hand recount of DAILY_12 lowFromGoal [5, 1, 8, 3, 2, 7, 4, 6]:
// - partition(0,7) v=5: iter1 i=1,2 (2), j=7,6 (2), swap(2,6) -> [5,1,4,3,2,7,8,6];
//   iter2 i=2..=5 (4), j=6,5 (2), post a[5]<5 (1) => 11; swap(0,4) -> [2,1,4,3,5,7,8,6], p=4.
// - left [2,1,4,3]: partition(0,3) = 5, partition(2,3) = 3 => 8.
// - right [7,8,6] (5..=7) v=7: iter1 i=6 (1), j=7 (1), swap(6,7) -> [7,6,8];
//   iter2 i=6,7 (2), j=7 (1), post a[7]<7 (1) => 6; swap(5,6). Total = 11 + 8 + 6 = 25.
//
// Hand recount of DAILY_7 start [4, 2, 6, 8, 1, 5, 3, 7]:
// - partition(0,7) v=4: iter1 i=1,2 (2), j=7,6 (2), swap(2,6) -> [4,2,3,8,1,5,6,7];
//   iter2 i=2,3 (2), j=6,5,4 (3), swap(3,4) -> [4,2,3,1,8,5,6,7];
//   iter3 i=3,4 (2), j=4 (1), post a[4]<4 (1) => 13; swap(0,3) -> [1,2,3,4,8,5,6,7], p=3.
// - left [1,2,3]: partition(0,2) = 4, partition(1,2) = 3 => 7.
// - right [8,5,6,7]: partition(4,7)=5 -> [7,5,6,8]; (4,6)=4 -> [6,5,7,8]; (4,5)=3 => 12.
// Total = 13 + 7 + 12 = 32.
#[test]
fn daily_12_and_daily_7_hand_counted_scores() {
    let d12 = daily_12();
    let d7 = inst(&[4, 2, 6, 8, 1, 5, 3, 7], &[2, 5]);
    let cases: [(&Instance, &str, &[i32], u32); 6] = [
        (&d12, "DAILY_12 start", &[8, 1, 6, 3, 2, 7, 4, 5], 30),
        (&d12, "DAILY_12 goal", &[8, 1, 5, 3, 2, 7, 4, 6], 34),
        (
            &d12,
            "DAILY_12 bestFromStart",
            &[8, 1, 6, 3, 2, 5, 4, 7],
            36,
        ),
        (&d12, "DAILY_12 bestFromGoal", &[8, 1, 5, 3, 2, 6, 4, 7], 36),
        (&d12, "DAILY_12 lowFromGoal", &[5, 1, 8, 3, 2, 7, 4, 6], 25),
        (&d7, "DAILY_7 start", &[4, 2, 6, 8, 1, 5, 3, 7], 32),
    ];

    for (instance, name, input, expected) in cases {
        assert_score_matches(name, instance, input, expected);
    }
}

// Hand trace of [2, 1]:
// partition(0, 1): v = a[0] = 2, i = 1, j = 1
// - while1: a[1] <= 2 (1 <= 2 T) && 1 < 1 (F) -> Compare(1, 2), exit
// - while2: 2 < a[1] (2 < 1 F)                -> Compare(1, 2), exit
// - i == j (1 == 1) -> break
// - j = a[1] < 2 ? 1 : 0 (1 < 2 T, j = 1)     -> Compare(1, 2)
// - swap(a, 0, 1) -> Swap(0, 1); a = [1, 2], returns 1.
#[test]
fn exact_steps_two_values_reversed() {
    assert_exact_steps(
        "2-value reversed",
        &[2, 1],
        &[cmp(1, 2), cmp(1, 2), cmp(1, 2), swp(0, 1)],
        3,
    );
}

// Hand trace of [1, 2]:
// partition(0, 1): v = a[0] = 1, i = 1, j = 1
// - while1: a[1] <= 1 (2 <= 1 F)              -> Compare(1, 1), exit
// - while2: 1 < a[1] (1 < 2 T) && 1 > 1 (F)   -> Compare(1, 1), exit
// - i == j (1 == 1) -> break
// - j = a[1] < 1 ? 1 : 0 (2 < 1 F, j = 0)     -> Compare(1, 1)
// - swap(a, 0, 0) -> Swap(0, 0); a = [1, 2], returns 0.
#[test]
fn exact_steps_two_values_sorted() {
    assert_exact_steps(
        "2-value sorted with self-swap Swap(0, 0)",
        &[1, 2],
        &[cmp(1, 1), cmp(1, 1), cmp(1, 1), swp(0, 0)],
        3,
    );
}

// Hand trace of [2, 4, 1, 3]:
// partition(0, 3): v = a[0] = 2, i = 1, j = 3
// - iter 1: while1 a[1]<=2 (4<=2 F) -> Compare(1, 2), i=1;
//           while2 2<a[3] (2<3 T, j->2) -> Compare(3, 2),
//                  2<a[2] (2<1 F) -> Compare(2, 2), j=2;
//           i!=j -> Swap(1, 2); a = [2, 1, 4, 3].
// - iter 2: while1 a[1]<=2 (1<=2 T, i->2) -> Compare(1, 2),
//                  a[2]<=2 (4<=2 F) -> Compare(2, 2), i=2;
//           while2 2<a[2] (2<4 T, 2>2 F) -> Compare(2, 2), j=2;
//           i==j -> break.
// - j = a[2] < 2 ? 2 : 1 (4<2 F, j=1) -> Compare(2, 2);
// - swap(a, 0, 1) -> Swap(0, 1); a = [1, 2, 4, 3], returns 1.
// left (0, 0) returns; right (2, 3) on [4, 3] (v=4):
// - Compare(3, 4), Compare(3, 4), Compare(3, 4), Swap(2, 3) -> [1, 2, 3, 4].
#[test]
fn exact_steps_four_values_right_recursion() {
    assert_exact_steps(
        "4-value right recursion",
        &[2, 4, 1, 3],
        &[
            cmp(1, 2),
            cmp(3, 2),
            cmp(2, 2),
            swp(1, 2),
            cmp(1, 2),
            cmp(2, 2),
            cmp(2, 2),
            cmp(2, 2),
            swp(0, 1),
            cmp(3, 4),
            cmp(3, 4),
            cmp(3, 4),
            swp(2, 3),
        ],
        10,
    );
}

// Hand trace of [3, 4, 1, 2]:
// partition(0, 3): v = a[0] = 3, i = 1, j = 3
// - iter 1: while1 a[1]<=3 (4<=3 F) -> Compare(1, 3);
//           while2 3<a[3] (3<2 F) -> Compare(3, 3);
//           i!=j -> Swap(1, 3); a = [3, 2, 1, 4].
// - iter 2: while1 a[1]<=3 (2<=3 T, i->2) -> Compare(1, 3),
//                  a[2]<=3 (1<=3 T, i->3) -> Compare(2, 3),
//                  a[3]<=3 (4<=3 F) -> Compare(3, 3), i=3;
//           while2 3<a[3] (3<4 T, 3>3 F) -> Compare(3, 3);
//           i==j -> break.
// - j = a[3] < 3 ? 3 : 2 (4<3 F, j=2) -> Compare(3, 3);
// - swap(a, 0, 2) -> Swap(0, 2); a = [1, 2, 3, 4], returns 2.
// left (0, 1) on [1, 2] (v=1): Compare(1,1) x3, Swap(0,0); right (3,3) returns.
#[test]
fn exact_steps_four_values_left_recursion() {
    assert_exact_steps(
        "4-value left recursion",
        &[3, 4, 1, 2],
        &[
            cmp(1, 3),
            cmp(3, 3),
            swp(1, 3),
            cmp(1, 3),
            cmp(2, 3),
            cmp(3, 3),
            cmp(3, 3),
            cmp(3, 3),
            swp(0, 2),
            cmp(1, 1),
            cmp(1, 1),
            cmp(1, 1),
            swp(0, 0),
        ],
        10,
    );
}

#[test]
fn lengths_zero_and_one() {
    let cases: [(&str, Instance, &[i32]); 2] = [
        ("empty array", free(&[]), &[]),
        ("single element with fixed slot", inst(&[42], &[0]), &[42]),
    ];
    for (label, instance, input) in cases {
        let steps = run_ok(label, &instance, input);
        assert!(
            steps.is_empty(),
            "run({input:?}) ({label}) should emit no steps, got {steps:?}"
        );
        let score = score_ok(label, &instance, input);
        assert_eq!(score, 0, "score({input:?}) ({label}) should be 0");
    }
}

// Hand trace of sorted [1, 2, 3, 4, 5]:
// - (0,4) v=1: 1+4+1=6 cmps, swap(0,0); (1,4) v=2: 1+3+1=5; (2,4) v=3: 1+2+1=4;
//   (3,4) v=4: 1+1+1=3. Total = 6 + 5 + 4 + 3 = 18.
//
// Hand trace of reversed [5, 4, 3, 2, 1]:
// - (0,4) v=5: 4+1+1=6 cmps, swap(0,4) -> [1,4,3,2,5];
// - (0,3) v=1: 1+3+1=5 cmps, swap(0,0);
// - (1,3) v=4: 2+1+1=4 cmps, swap(1,3) -> [1,2,3,4,5];
// - (1,2) v=2: 1+1+1=3 cmps, swap(1,1). Total = 6 + 5 + 4 + 3 = 18.
#[test]
fn sorted_and_reversed_length_five() {
    for (label, input, expected) in [
        ("sorted length 5", &[1, 2, 3, 4, 5][..], 18u32),
        ("reversed length 5", &[5, 4, 3, 2, 1][..], 18u32),
    ] {
        let instance = free(input);
        let steps = assert_score_matches(label, &instance, input, expected);
        assert_eq!(
            apply_swaps(input, &steps),
            vec![1, 2, 3, 4, 5],
            "applying Swaps from run({input:?}) ({label}) should sort ascending"
        );
    }
}

#[test]
fn properties_over_all_permutations_with_one_fixed_slot() {
    let instance = inst(&[3, 6, 1, 5, 2, 4], &[2]);
    let expected_sorted = vec![1, 2, 3, 4, 5, 6];
    let perms = generate_permutations(&[2, 3, 4, 5, 6]);
    assert_eq!(
        perms.len(),
        120,
        "5 free values should generate 5! = 120 permutations"
    );

    for mut input in perms {
        input.insert(2, 1);

        let steps = run_ok("all-permutations property", &instance, &input);
        let score = score_ok("all-permutations property", &instance, &input);

        let compare_count = count_compares(&steps);
        assert_eq!(
            score, compare_count,
            "input {input:?}: score ({score}) must equal number of Compare steps ({compare_count})"
        );
        assert_eq!(
            apply_swaps(&input, &steps),
            expected_sorted,
            "input {input:?}: applying Swap steps in order must sort to {expected_sorted:?}"
        );
        assert_partition_and_pivot_invariants(&input, &steps);
    }
}

#[test]
fn input_errors_and_agreement() {
    let base = inst(&[4, 1, 3, 2, 5], &[1, 3]);
    let unsorted = inst(&[4, 1, 3, 2, 5], &[3, 1]);
    let wl = |got| InputError::WrongLength { expected: 5, got };
    let fm = |index| InputError::FixedValueMoved { index };
    let nap = InputError::NotAPermutation;
    let cases: [(&str, &Instance, &[i32], InputError); 9] = [
        // One violation per input for each InputError variant.
        ("WrongLength (short)", &base, &[4, 1, 3, 2], wl(4)),
        ("WrongLength (long)", &base, &[4, 1, 3, 2, 5, 6], wl(6)),
        ("FixedValueMoved (slot 1)", &base, &[1, 4, 3, 2, 5], fm(1)),
        ("FixedValueMoved (slot 3)", &base, &[4, 1, 2, 3, 5], fm(3)),
        (
            "NotAPermutation (dup)",
            &base,
            &[4, 1, 4, 2, 5],
            nap.clone(),
        ),
        ("NotAPermutation (extra)", &base, &[9, 1, 3, 2, 5], nap),
        // Precedence: WrongLength > FixedValueMoved (ascending) > NotAPermutation.
        (
            "FixedValueMoved ascending",
            &unsorted,
            &[4, 2, 3, 1, 5],
            fm(1),
        ),
        ("WrongLength precedes others", &base, &[9, 9], wl(2)),
        (
            "FixedValueMoved precedes NotAPerm",
            &base,
            &[4, 9, 3, 2, 5],
            fm(1),
        ),
    ];

    for (label, instance, input, expected) in cases {
        assert_error_agrees(label, instance, input, expected);
    }
}

#[test]
fn template_id_and_rules() {
    assert_eq!(
        Quicksort::ID,
        "quicksort-most-comparisons",
        "Quicksort::ID should be \"quicksort-most-comparisons\""
    );

    let instance = daily_12();
    let rules = Quicksort.rules(&instance);
    for sentence in [
        "Arrange the free values so quicksort makes as many comparisons as possible.",
        "Fixed values stay where they are.",
    ] {
        assert!(
            rules.contains(sentence),
            "rules({instance:?}) = {rules:?}: expected plain text containing {sentence:?}"
        );
    }
}
