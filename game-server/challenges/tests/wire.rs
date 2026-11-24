use daily_challenges::wire::score_request;

fn request(template: &str, values: &[i32], fixed: &[usize], arrangement: &[i32]) -> Vec<u8> {
    serde_json::json!({
        "template": template,
        "values": values,
        "fixed": fixed,
        "arrangement": arrangement,
    })
    .to_string()
    .into_bytes()
}

const QUICKSORT: &str = "quicksort-most-comparisons";

#[test]
fn scores_a_request_as_json() {
    // [2, 1]: two value comparisons in the loops, one for `a[i] < v`.
    let reply = score_request(&request(QUICKSORT, &[1, 2], &[], &[2, 1]));
    assert_eq!(
        reply,
        Ok("{\"score\":3}".to_owned()),
        "quicksort [2, 1]: reply should be {{\"score\":3}}, got {reply:?}"
    );
}

#[test]
fn an_empty_puzzle_scores_zero() {
    let reply = score_request(&request(QUICKSORT, &[], &[], &[]));
    assert_eq!(
        reply,
        Ok("{\"score\":0}".to_owned()),
        "quicksort []: reply should be {{\"score\":0}}, got {reply:?}"
    );
}

#[test]
fn unknown_template_names_the_id() {
    let message = score_request(&request("bubble-sort", &[1], &[], &[1])).unwrap_err();
    assert!(message.contains("bubble-sort"), "{message}");
}

#[test]
fn wrong_length_says_how_many_values() {
    let message = score_request(&request(QUICKSORT, &[1, 2, 3], &[], &[1, 2])).unwrap_err();
    assert!(message.contains("length"), "{message}");
    assert!(message.contains('3') && message.contains('2'), "{message}");
}

#[test]
fn a_moved_fixed_value_names_its_slot() {
    let message = score_request(&request(QUICKSORT, &[1, 2, 3], &[2], &[1, 3, 2])).unwrap_err();
    assert!(message.contains("fixed"), "{message}");
    assert!(message.contains("slot 3"), "{message}");
}

#[test]
fn a_changed_value_is_not_a_permutation() {
    let message = score_request(&request(QUICKSORT, &[1, 2, 3], &[], &[1, 2, 4])).unwrap_err();
    assert!(message.contains("permutation"), "{message}");
}

#[test]
fn a_fixed_slot_past_the_end_is_an_error_not_a_trap() {
    let message = score_request(&request(QUICKSORT, &[1, 2], &[5], &[1, 2])).unwrap_err();
    assert!(message.contains("fixed slot 6"), "{message}");
}

#[test]
fn malformed_requests_are_reported() {
    for bad in [
        &b"not json"[..],
        br#"{"template":"quicksort-most-comparisons"}"#,
        br#"{"template":"x","values":[1.5],"fixed":[],"arrangement":[]}"#,
        br#"{"template":"x","values":[],"fixed":[-1],"arrangement":[]}"#,
        br#"{"template":"x","values":[],"fixed":[],"arrangement":[],"extra":1}"#,
    ] {
        let message = score_request(bad).unwrap_err();
        assert!(message.contains("could not be read"), "{message}");
    }
}

#[test]
fn large_inputs_score_the_same_as_a_direct_call() {
    use daily_challenges::Template;
    use daily_challenges::quicksort::{Instance, Quicksort};

    let values: Vec<i32> = (0..500).collect();
    let arrangement: Vec<i32> = (0..500).map(|i| (i * 7) % 500).collect();
    let instance = Instance {
        values: values.clone(),
        fixed: vec![],
    };
    let direct = Quicksort.score(&instance, &arrangement).unwrap();
    let reply = score_request(&request(QUICKSORT, &values, &[], &arrangement));
    assert_eq!(
        reply,
        Ok(format!("{{\"score\":{direct}}}")),
        "quicksort 500 values: wire reply should match direct score {direct}, got {reply:?}"
    );
}

#[test]
fn a_huge_fixed_index_does_not_wrap_its_slot_number() {
    let message =
        score_request(&request(QUICKSORT, &[1, 2], &[4_294_967_295], &[1, 2])).unwrap_err();
    assert!(message.contains("fixed slot 4294967296"), "{message}");
}

#[cfg(target_pointer_width = "64")]
#[test]
fn a_usize_max_fixed_index_does_not_overflow_its_slot_number() {
    let message = score_request(&request(QUICKSORT, &[1, 2], &[usize::MAX], &[1, 2])).unwrap_err();
    assert!(
        message.contains("fixed slot 18446744073709551616"),
        "{message}"
    );
}

const BUBBLE: &str = "bubble-exact-passes";
const INSERTION_MERGE: &str = "insertion-beats-merge";

fn bubble_request(values: &[i32], fixed: &[usize], target: u32, arrangement: &[i32]) -> Vec<u8> {
    serde_json::json!({
        "template": BUBBLE,
        "values": values,
        "fixed": fixed,
        "targetPasses": target,
        "arrangement": arrangement,
    })
    .to_string()
    .into_bytes()
}

fn reply_json(request: &[u8]) -> serde_json::Value {
    let text = String::from_utf8_lossy(request).into_owned();
    let reply = score_request(request).unwrap_or_else(|message| {
        panic!("score_request({text}) should succeed, got Err({message:?})")
    });
    serde_json::from_str(&reply).unwrap_or_else(|error| {
        panic!("score_request({text}) reply {reply:?} should be JSON: {error}")
    })
}

fn assert_reply(request: &[u8], expected: serde_json::Value, behaviour: &str) {
    let text = String::from_utf8_lossy(request).into_owned();
    let reply = reply_json(request);
    assert_eq!(
        reply, expected,
        "score_request({text}): {behaviour}; expected {expected}, got {reply}"
    );
}

const BUBBLE_21_VALUES: [i32; 8] = [6, 2, 8, 1, 5, 3, 7, 4];

#[test]
fn bubble_solved_reply_has_score_passes_and_swaps() {
    let request = bubble_request(&BUBBLE_21_VALUES, &[1, 4, 6], 4, &[4, 2, 8, 1, 5, 3, 7, 6]);
    let expected = serde_json::json!({"solved": true, "score": 11, "passes": 4, "swaps": 11});
    assert_reply(
        &request,
        expected,
        "4 passes meets targetPasses 4, so score is the 11 swaps",
    );
}

#[test]
fn bubble_unsolved_reply_has_null_score() {
    let request = bubble_request(&BUBBLE_21_VALUES, &[1, 4, 6], 4, &BUBBLE_21_VALUES);
    let expected = serde_json::json!({"solved": false, "score": null, "passes": 5, "swaps": 14});
    assert_reply(
        &request,
        expected,
        "5 passes misses targetPasses 4, so score is null but passes and swaps are kept",
    );
}

#[test]
fn bubble_reversed_takes_n_minus_one_passes() {
    let request = bubble_request(&[1, 2, 3, 4, 5, 6, 7, 8], &[], 8, &[8, 7, 6, 5, 4, 3, 2, 1]);
    let expected = serde_json::json!({"solved": false, "score": null, "passes": 7, "swaps": 28});
    assert_reply(
        &request,
        expected,
        "8 reversed values take n - 1 = 7 passes, never 8",
    );
}

#[test]
fn bubble_without_target_passes_is_an_error() {
    let request = request(BUBBLE, &[1, 2], &[], &[2, 1]);
    let text = String::from_utf8_lossy(&request).into_owned();
    let reply = score_request(&request);
    let message = reply.clone().err().unwrap_or_default();
    assert!(
        reply.is_err() && message.contains("targetPasses"),
        "score_request({text}): a bubble request without targetPasses should fail naming \"targetPasses\", got {reply:?}"
    );
}

#[test]
fn bubble_fixed_slot_past_the_end_is_an_error() {
    let request = bubble_request(&[1, 2], &[5], 1, &[1, 2]);
    let reply = score_request(&request);
    let message = reply.clone().err().unwrap_or_default();
    assert!(
        message.contains("fixed slot 6"),
        "score_request(bubble, values [1, 2], fixed [5]): should fail naming \"fixed slot 6\", got {reply:?}"
    );
}

#[test]
fn bubble_moved_fixed_value_is_an_error() {
    let request = bubble_request(&BUBBLE_21_VALUES, &[1, 4, 6], 4, &[2, 6, 8, 1, 5, 3, 7, 4]);
    let reply = score_request(&request);
    let message = reply.clone().err().unwrap_or_default();
    assert!(
        message.contains("slot 2") && message.contains("fixed"),
        "score_request(bubble #21 with slots 0 and 1 swapped): should fail naming fixed \"slot 2\", got {reply:?}"
    );
}

const INSERTION_22_VALUES: [i32; 8] = [5, 3, 8, 1, 7, 2, 6, 4];

#[test]
fn insertion_merge_solved_reply_scores_inversions() {
    let request = request(
        INSERTION_MERGE,
        &INSERTION_22_VALUES,
        &[1, 4],
        &[5, 3, 2, 6, 7, 1, 4, 8],
    );
    let expected = serde_json::json!({
        "solved": true, "score": 11, "insertionComparisons": 15, "mergeComparisons": 16, "inversions": 11
    });
    assert_reply(
        &request,
        expected,
        "insertion 15 < merge 16, so score is the 11 out-of-order pairs",
    );
}

#[test]
fn insertion_merge_tie_reply_has_null_score() {
    let request = request(
        INSERTION_MERGE,
        &INSERTION_22_VALUES,
        &[1, 4],
        &[5, 3, 1, 6, 7, 2, 8, 4],
    );
    let expected = serde_json::json!({
        "solved": false, "score": null, "insertionComparisons": 16, "mergeComparisons": 16, "inversions": 11
    });
    assert_reply(
        &request,
        expected,
        "insertion 16 = merge 16 is a tie, which is unsolved",
    );
}

#[test]
fn insertion_merge_slower_insertion_reply_has_null_score() {
    let request = request(
        INSERTION_MERGE,
        &INSERTION_22_VALUES,
        &[1, 4],
        &INSERTION_22_VALUES,
    );
    let expected = serde_json::json!({
        "solved": false, "score": null, "insertionComparisons": 20, "mergeComparisons": 17, "inversions": 15
    });
    assert_reply(&request, expected, "insertion 20 > merge 17 is unsolved");
}

#[test]
fn non_bubble_templates_reject_target_passes() {
    for template in [QUICKSORT, INSERTION_MERGE] {
        for target_passes in [serde_json::json!(1), serde_json::Value::Null] {
            let raw = serde_json::json!({
                "template": template,
                "values": [1, 2],
                "fixed": [],
                "targetPasses": target_passes,
                "arrangement": [2, 1],
            })
            .to_string()
            .into_bytes();
            let reply = score_request(&raw);
            let message = reply.clone().err().unwrap_or_default();
            assert!(
                reply.is_err() && message.contains("targetPasses"),
                "score_request({template} with targetPasses={target_passes}): should reject unexpected targetPasses, got {reply:?}"
            );
        }
    }
}

#[test]
fn bubble_with_null_target_passes_is_an_error() {
    let raw = serde_json::json!({
        "template": BUBBLE,
        "values": [1, 2],
        "fixed": [],
        "targetPasses": null,
        "arrangement": [2, 1],
    })
    .to_string()
    .into_bytes();
    let reply = score_request(&raw);
    let message = reply.clone().err().unwrap_or_default();
    assert!(
        reply.is_err() && message.contains("targetPasses"),
        "score_request(bubble with targetPasses=null): should fail naming \"targetPasses\", got {reply:?}"
    );
}
