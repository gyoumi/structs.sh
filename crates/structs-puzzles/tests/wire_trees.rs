use serde_json::{Value, json};
use structs_puzzles::wire::score_request;

// Wire JSON for the tree templates. Counts match the hand-worked puzzles in
// `e2e/support/daily-tree-fixtures.ts` (#23, #24, #25).

const AVL: &str = "avl-most-rotations";
const FORCED: &str = "bst-forced-order";
const UPSET: &str = "upset-bst-beats-avl";

const AVL_23_VALUES: [i32; 8] = [5, 1, 3, 8, 6, 7, 2, 4];
const FORCED_24_VALUES: [i32; 10] = [3, 6, 9, 1, 2, 5, 4, 7, 8, 10];
const FORCED_24_TARGET: [i32; 10] = [6, 3, 1, 2, 5, 4, 9, 7, 8, 10];
const UPSET_25_VALUES: [i32; 14] = [3, 2, 13, 6, 14, 1, 8, 10, 5, 12, 11, 7, 4, 9];
const UPSET_25_FIXED: [usize; 6] = [0, 1, 5, 9, 11, 12];

fn bytes(request: &Value) -> Vec<u8> {
    request.to_string().into_bytes()
}

fn assert_reply(request: &Value, expected: Value, behaviour: &str) {
    let reply = score_request(&bytes(request)).unwrap_or_else(|message| {
        panic!("score_request({request}) should succeed, got Err({message:?})")
    });
    let reply: Value = serde_json::from_str(&reply).unwrap_or_else(|error| {
        panic!("score_request({request}) reply {reply:?} should be JSON: {error}")
    });
    assert_eq!(
        reply, expected,
        "score_request({request}): {behaviour}; expected {expected}, got {reply}"
    );
}

fn assert_rejected(request: &Value, needle: &str, behaviour: &str) {
    let reply = score_request(&bytes(request));
    let message = reply.clone().err().unwrap_or_default();
    assert!(
        reply.is_err() && message.contains(needle),
        "score_request({request}): {behaviour}, with a message naming {needle:?}; got {reply:?}"
    );
}

fn forced(arrangement: &[i32]) -> Value {
    json!({
        "template": FORCED,
        "values": FORCED_24_VALUES,
        "targetTree": FORCED_24_TARGET,
        "arrangement": arrangement,
    })
}

fn with(mut request: Value, field: &str, value: Value) -> Value {
    request[field] = value;
    request
}

fn without(mut request: Value, field: &str) -> Value {
    if let Some(object) = request.as_object_mut() {
        object.remove(field);
    }
    request
}

#[test]
fn avl_reply_is_always_solved_and_scores_rotations() {
    let start = json!({"template": AVL, "values": AVL_23_VALUES, "fixed": [0, 5], "arrangement": AVL_23_VALUES});
    let expected = json!({"solved": true, "score": 5, "rotations": 5});
    assert_reply(&start, expected, "#23 start makes 5 rotations");
    let doubles = with(start, "arrangement", json!([5, 1, 2, 8, 6, 7, 3, 4]));
    let expected = json!({"solved": true, "score": 7, "rotations": 7});
    assert_reply(&doubles, expected, "#23 doubles makes 7 rotations");
    let empty = json!({"template": AVL, "values": [], "fixed": [], "arrangement": []});
    let expected = json!({"solved": true, "score": 0, "rotations": 0});
    assert_reply(&empty, expected, "an empty tree makes no rotations");
}

#[test]
fn avl_moved_fixed_value_is_an_error() {
    let request = json!({
        "template": AVL, "values": AVL_23_VALUES, "fixed": [0, 5],
        "arrangement": [1, 5, 3, 8, 6, 7, 2, 4],
    });
    assert_rejected(
        &request,
        "slot 1",
        "moving fixed slot 1 (value 5) should fail",
    );
}

#[test]
fn forced_order_replies() {
    let solved = forced(&[6, 3, 9, 5, 1, 2, 4, 7, 8, 10]);
    let expected = json!({"solved": true, "score": 6, "longestIncreasingRun": 6});
    assert_reply(
        &solved,
        expected,
        "#24 solved builds the target, so its run 6 is the score",
    );
    let start = forced(&FORCED_24_VALUES);
    let expected = json!({"solved": false, "score": null, "longestIncreasingRun": 4});
    assert_reply(
        &start,
        expected,
        "#24 start builds a different tree, so score is null but the run is kept",
    );
    let long_run = forced(&[6, 9, 3, 1, 2, 4, 5, 7, 8, 10]);
    let expected = json!({"solved": false, "score": null, "longestIncreasingRun": 7});
    assert_reply(
        &long_run,
        expected,
        "#24 longRun has a longer run but a different tree, so it is unsolved",
    );
}

#[test]
fn forced_order_accepts_an_empty_fixed_list() {
    let solved = forced(&[6, 3, 9, 5, 1, 2, 4, 7, 8, 10]);
    let expected = json!({"solved": true, "score": 6, "longestIncreasingRun": 6});
    assert_reply(
        &with(solved, "fixed", json!([])),
        expected,
        "an empty fixed list is the same as none",
    );
}

#[test]
fn forced_order_rejects_bad_fields() {
    let solved = forced(&[6, 3, 9, 5, 1, 2, 4, 7, 8, 10]);
    let cases = [
        (
            with(solved.clone(), "fixed", json!([0])),
            "fixed",
            "a forced-order puzzle has no fixed slots",
        ),
        (
            without(solved.clone(), "targetTree"),
            "targetTree",
            "a forced-order puzzle needs targetTree",
        ),
        (
            with(solved.clone(), "targetTree", Value::Null),
            "targetTree",
            "a null targetTree should fail",
        ),
        (
            with(solved.clone(), "targetPasses", json!(2)),
            "targetPasses",
            "targetPasses belongs to bubble only",
        ),
        (
            with(solved, "targetPasses", Value::Null),
            "targetPasses",
            "even a null targetPasses is unexpected",
        ),
        (
            forced(&[6, 3, 9]),
            "length",
            "an arrangement of 3 values for a 10-value puzzle should fail",
        ),
        (
            json!({
                "template": FORCED,
                "values": [1, 2, 3],
                "targetTree": [2, 3, 1],
                "arrangement": [2, 1, 3],
            }),
            "targetTree",
            "a targetTree that is not a valid BST preorder should fail",
        ),
        (
            json!({
                "template": FORCED,
                "values": [1, 2, 3],
                "targetTree": [1, 2],
                "arrangement": [1, 2, 3],
            }),
            "targetTree",
            "a targetTree missing a key from values should fail",
        ),
    ];
    for (request, needle, behaviour) in cases {
        assert_rejected(&request, needle, behaviour);
    }
}

#[test]
fn upset_replies() {
    let start = json!({"template": UPSET, "values": UPSET_25_VALUES, "fixed": UPSET_25_FIXED, "arrangement": UPSET_25_VALUES});
    let expected = json!({"solved": false, "score": null, "bstNodesPassed": 42, "avlNodesPassed": 38, "margin": 0});
    assert_reply(&start, expected, "#25 start: BST 42 >= AVL 38 is unsolved");
    let solved = with(
        start,
        "arrangement",
        json!([3, 2, 8, 13, 14, 1, 10, 9, 6, 12, 11, 7, 4, 5]),
    );
    let expected = json!({"solved": true, "score": 4, "bstNodesPassed": 37, "avlNodesPassed": 41, "margin": 4});
    assert_reply(
        &solved,
        expected,
        "#25 solved: BST 37 < AVL 41, margin 4 (rotations not counted)",
    );
    let tie = json!({"template": UPSET, "values": [1, 2], "fixed": [], "arrangement": [1, 2]});
    let expected = json!({"solved": false, "score": null, "bstNodesPassed": 1, "avlNodesPassed": 1, "margin": 0});
    assert_reply(&tie, expected, "BST 1 = AVL 1 is a tie, which is unsolved");
}

#[test]
fn other_templates_reject_target_tree() {
    let requests = [
        json!({"template": "quicksort-most-comparisons", "values": [1, 2], "fixed": [], "arrangement": [2, 1]}),
        json!({"template": "bubble-exact-passes", "values": [1, 2], "fixed": [], "targetPasses": 1, "arrangement": [2, 1]}),
        json!({"template": "insertion-beats-merge", "values": [1, 2], "fixed": [], "arrangement": [2, 1]}),
        json!({"template": AVL, "values": [1, 2], "fixed": [], "arrangement": [2, 1]}),
        json!({"template": UPSET, "values": [1, 2], "fixed": [], "arrangement": [2, 1]}),
    ];
    for request in requests {
        for target_tree in [json!([1, 2]), Value::Null] {
            let request = with(request.clone(), "targetTree", target_tree);
            assert_rejected(
                &request,
                "targetTree",
                "only bst-forced-order takes targetTree",
            );
        }
    }
}

#[test]
fn avl_and_upset_reject_target_passes() {
    for template in [AVL, UPSET] {
        for target_passes in [json!(1), Value::Null] {
            let request = json!({
                "template": template, "values": [1, 2], "fixed": [],
                "targetPasses": target_passes, "arrangement": [2, 1],
            });
            assert_rejected(
                &request,
                "targetPasses",
                "only bubble-exact-passes takes targetPasses",
            );
        }
    }
}
