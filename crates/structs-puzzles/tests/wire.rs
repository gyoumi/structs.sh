use structs_puzzles::wire::score_request;

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
    assert_eq!(reply, Ok("{\"score\":3}".to_owned()));
}

#[test]
fn an_empty_puzzle_scores_zero() {
    let reply = score_request(&request(QUICKSORT, &[], &[], &[]));
    assert_eq!(reply, Ok("{\"score\":0}".to_owned()));
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
    use structs_puzzles::Template;
    use structs_puzzles::quicksort::{Instance, Quicksort};

    let values: Vec<i32> = (0..500).collect();
    let arrangement: Vec<i32> = (0..500).map(|i| (i * 7) % 500).collect();
    let instance = Instance {
        values: values.clone(),
        fixed: vec![],
    };
    let direct = Quicksort.score(&instance, &arrangement).unwrap();
    let reply = score_request(&request(QUICKSORT, &values, &[], &arrangement));
    assert_eq!(reply, Ok(format!("{{\"score\":{direct}}}")));
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
