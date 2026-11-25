//! The JSON the browser sends to the wasm build, and the replies it gets.
//!
//! Request (UTF-8 JSON):
//! `{"template": "quicksort-most-comparisons", "values": [..], "fixed": [..], "arrangement": [..]}`.
//! A `bubble-exact-passes` request also carries `"targetPasses": k`, and only
//! it may. A `bst-forced-order` request carries `"targetTree": [..]` (the
//! target's preorder), and only it may; it has no fixed slots, so its
//! `fixed` is left out or `[]`. Every other template needs `fixed`.
//!
//! A `linked-list-index-drift` request is
//! `{"template": "linked-list-index-drift", "start": [..], "target": [..],
//! "operations": [{"kind": "delete", "index": 0}, {"kind": "insert", "value": 5, "index": 2}]}`,
//! and takes none of the array templates' fields.
//!
//! Success replies, by template:
//! - `quicksort-most-comparisons`: `{"score": 12}`.
//! - `bubble-exact-passes`: `{"solved": true, "score": 9, "passes": 4, "swaps": 9}`.
//! - `insertion-beats-merge`: `{"solved": true, "score": 7,
//!   "insertionComparisons": 14, "mergeComparisons": 16, "inversions": 7}`.
//! - `avl-most-rotations`: `{"solved": true, "score": 5, "rotations": 5}`.
//! - `bst-forced-order`: `{"solved": true, "score": 3, "longestIncreasingRun": 3}`.
//! - `upset-bst-beats-avl`: `{"solved": true, "score": 4, "bstNodesPassed": 20,
//!   "avlNodesPassed": 24, "margin": 4}`.
//! - `linked-list-index-drift`: `{"solved": true, "score": 5, "operations": 2,
//!   "nodesWalked": 3, "cost": 5}`.
//!
//! `score` is `null` when the try is unsolved. A failure reply is a
//! plain-English message a player can read, as UTF-8 text.

use crate::avl_rotations::{self, AvlRotations};
use crate::bst_forced_order::{self, BstForcedOrder};
use crate::bubble::{self, Bubble};
use crate::insertion_beats_merge::{self, InsertionBeatsMerge};
use crate::linked_list_index_drift::LinkedListIndexDrift;
use crate::list_wire::index_drift;
use crate::quicksort::{self, Quicksort};
use crate::request::{ArrayRequest, Request};
use crate::upset_bst_beats_avl::{self, UpsetBstBeatsAvl};
use crate::{InputError, Template};
use serde::Serialize;

const TEMPLATES: [&str; 7] = [
    Quicksort::ID,
    Bubble::ID,
    InsertionBeatsMerge::ID,
    AvlRotations::ID,
    BstForcedOrder::ID,
    UpsetBstBeatsAvl::ID,
    LinkedListIndexDrift::ID,
];

#[derive(Serialize)]
struct QuicksortReply {
    score: u32,
}

#[derive(Serialize)]
struct BubbleReply {
    solved: bool,
    score: Option<u32>,
    passes: u32,
    swaps: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct InsertionBeatsMergeReply {
    solved: bool,
    score: Option<u32>,
    insertion_comparisons: u32,
    merge_comparisons: u32,
    inversions: u32,
}

#[derive(Serialize)]
struct AvlRotationsReply {
    solved: bool,
    score: u32,
    rotations: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BstForcedOrderReply {
    solved: bool,
    score: Option<u32>,
    longest_increasing_run: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UpsetReply {
    solved: bool,
    score: Option<u32>,
    bst_nodes_passed: u32,
    avl_nodes_passed: u32,
    margin: u32,
}

/// Decodes `request`, scores it, and returns the JSON reply, or the message
/// to show the player.
pub fn score_request(request: &[u8]) -> Result<String, String> {
    let request: Request = serde_json::from_slice(request)
        .map_err(|error| format!("The challenge request could not be read: {error}."))?;
    if !TEMPLATES.contains(&request.template.as_str()) {
        return Err(format!(
            "Unknown challenge template \"{}\".",
            request.template
        ));
    }
    if request.template == LinkedListIndexDrift::ID {
        return index_drift(request.into_list()?);
    }
    let request = request.into_array()?;
    if request.template != Bubble::ID {
        request.reject_target_passes()?;
    }
    if request.template != BstForcedOrder::ID {
        request.reject_target_tree()?;
    }
    let reply = match request.template.as_str() {
        BstForcedOrder::ID => forced_order(&request)?,
        _ => with_fixed(&request, request.required_fixed()?)?,
    };
    reply.map_err(|error| format!("The challenge reply could not be written: {error}."))
}

type Reply = Result<String, serde_json::Error>;

fn with_fixed(request: &ArrayRequest, fixed: Vec<usize>) -> Result<Reply, String> {
    let values = request.values.clone();
    let arrangement = &request.arrangement;
    Ok(match request.template.as_str() {
        Quicksort::ID => {
            let score = Quicksort
                .score(&quicksort::Instance { values, fixed }, arrangement)
                .map_err(|error| describe(&error))?;
            serde_json::to_string(&QuicksortReply { score })
        }
        Bubble::ID => {
            let target_passes = request.target_passes.flatten().ok_or_else(|| {
                "The challenge is broken: a bubble-exact-passes challenge needs targetPasses."
                    .to_owned()
            })?;
            let instance = bubble::Instance {
                values,
                fixed,
                target_passes,
            };
            let outcome = Bubble
                .evaluate(&instance, arrangement)
                .map_err(|error| describe(&error))?;
            serde_json::to_string(&BubbleReply {
                solved: outcome.solved,
                score: outcome.solved.then_some(outcome.swaps),
                passes: outcome.passes,
                swaps: outcome.swaps,
            })
        }
        InsertionBeatsMerge::ID => {
            let instance = insertion_beats_merge::Instance { values, fixed };
            let outcome = InsertionBeatsMerge
                .evaluate(&instance, arrangement)
                .map_err(|error| describe(&error))?;
            serde_json::to_string(&InsertionBeatsMergeReply {
                solved: outcome.solved,
                score: outcome.solved.then_some(outcome.inversions),
                insertion_comparisons: outcome.insertion_comparisons,
                merge_comparisons: outcome.merge_comparisons,
                inversions: outcome.inversions,
            })
        }
        AvlRotations::ID => {
            let instance = avl_rotations::Instance { values, fixed };
            let outcome = AvlRotations
                .evaluate(&instance, arrangement)
                .map_err(|error| describe(&error))?;
            serde_json::to_string(&AvlRotationsReply {
                solved: true,
                score: outcome.rotations,
                rotations: outcome.rotations,
            })
        }
        UpsetBstBeatsAvl::ID => {
            let instance = upset_bst_beats_avl::Instance { values, fixed };
            let outcome = UpsetBstBeatsAvl
                .evaluate(&instance, arrangement)
                .map_err(|error| describe(&error))?;
            serde_json::to_string(&UpsetReply {
                solved: outcome.solved,
                score: outcome.solved.then_some(outcome.margin),
                bst_nodes_passed: outcome.bst_nodes_passed,
                avl_nodes_passed: outcome.avl_nodes_passed,
                margin: outcome.margin,
            })
        }
        _ => unreachable!("templates were checked in score_request"),
    })
}

fn forced_order(request: &ArrayRequest) -> Result<Reply, String> {
    request.no_fixed(BstForcedOrder::ID)?;
    let target_tree = request.target_tree.clone().flatten().ok_or_else(|| {
        "The challenge is broken: a bst-forced-order challenge needs targetTree.".to_owned()
    })?;
    if !bst_forced_order::is_valid_target_tree(&request.values, &target_tree) {
        return Err(
            "The challenge is broken: targetTree is not a valid BST preorder of the challenge's values."
                .to_owned(),
        );
    }
    let instance = bst_forced_order::Instance {
        values: request.values.clone(),
        target_tree,
    };
    let outcome = BstForcedOrder
        .evaluate(&instance, &request.arrangement)
        .map_err(|error| describe(&error))?;
    Ok(serde_json::to_string(&BstForcedOrderReply {
        solved: outcome.solved,
        score: outcome.solved.then_some(outcome.longest_increasing_run),
        longest_increasing_run: outcome.longest_increasing_run,
    }))
}

/// Slots are numbered from 1 in messages, as players count them. Indexes widen
/// to u128 before the add so usize::MAX can't overflow or wrap to 0.
pub(crate) fn describe(error: &InputError) -> String {
    match error {
        InputError::FixedSlotOutOfRange { index } => format!(
            "The challenge is broken: fixed slot {} is past its last value.",
            *index as u128 + 1
        ),
        InputError::WrongLength { expected, got } => {
            format!("The arrangement has the wrong length: it needs {expected} values, not {got}.")
        }
        InputError::FixedValueMoved { index } => format!(
            "A fixed value moved: slot {} is fixed and has to keep its value.",
            *index as u128 + 1
        ),
        InputError::NotAPermutation => {
            "The arrangement has to be a permutation of the challenge's \
             values: use each value exactly once."
                .to_owned()
        }
        InputError::DeleteIndexOutOfRange {
            operation,
            index,
            length,
        } => format!(
            "Operation {} can't delete index {index}: the list has {length} nodes then, so a \
             delete index has to be below {length}.",
            *operation as u128 + 1
        ),
    }
}
