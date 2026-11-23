//! The JSON the browser sends to the wasm build, and the replies it gets.
//!
//! Request (UTF-8 JSON):
//! `{"template": "quicksort-most-comparisons", "values": [..], "fixed": [..], "arrangement": [..]}`.
//! A `bubble-exact-passes` request also carries `"targetPasses": k`.
//!
//! Success replies, by template:
//! - `quicksort-most-comparisons`: `{"score": 12}`.
//! - `bubble-exact-passes`: `{"solved": true, "score": 9, "passes": 4, "swaps": 9}`.
//! - `insertion-beats-merge`: `{"solved": true, "score": 7,
//!   "insertionComparisons": 14, "mergeComparisons": 16, "inversions": 7}`.
//!
//! `score` is `null` when the try is unsolved. A failure reply is a
//! plain-English message a player can read, as UTF-8 text.

use crate::bubble::{self, Bubble};
use crate::insertion_beats_merge::{self, InsertionBeatsMerge};
use crate::quicksort::{self, Quicksort};
use crate::{InputError, Template};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Request {
    template: String,
    values: Vec<i32>,
    fixed: Vec<usize>,
    arrangement: Vec<i32>,
    #[serde(default, deserialize_with = "present")]
    target_passes: Option<Option<u32>>,
}

fn present<'de, D, T>(deserializer: D) -> Result<Option<T>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    T::deserialize(deserializer).map(Some)
}

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

/// Decodes `request`, scores it, and returns the JSON reply, or the message
/// to show the player.
pub fn score_request(request: &[u8]) -> Result<String, String> {
    let request: Request = serde_json::from_slice(request)
        .map_err(|error| format!("The puzzle request could not be read: {error}."))?;
    if ![Quicksort::ID, Bubble::ID, InsertionBeatsMerge::ID].contains(&request.template.as_str()) {
        return Err(format!("Unknown puzzle template \"{}\".", request.template));
    }
    check_fixed(&request)?;
    let values = request.values.clone();
    let fixed = request.fixed.clone();
    let arrangement = &request.arrangement;
    let reply = match request.template.as_str() {
        Quicksort::ID => {
            reject_target_passes(&request)?;
            let score = Quicksort
                .score(&quicksort::Instance { values, fixed }, arrangement)
                .map_err(|error| describe(&error))?;
            serde_json::to_string(&QuicksortReply { score })
        }
        Bubble::ID => {
            let target_passes = request.target_passes.flatten().ok_or_else(|| {
                "The puzzle is broken: a bubble-exact-passes puzzle needs targetPasses.".to_owned()
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
            reject_target_passes(&request)?;
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
        _ => unreachable!("templates were checked above"),
    };
    reply.map_err(|error| format!("The puzzle reply could not be written: {error}."))
}

fn reject_target_passes(request: &Request) -> Result<(), String> {
    if request.target_passes.is_some() {
        return Err(
            "The puzzle request could not be read: unexpected field `targetPasses`.".to_owned(),
        );
    }
    Ok(())
}

fn check_fixed(request: &Request) -> Result<(), String> {
    match request
        .fixed
        .iter()
        .find(|&&index| index >= request.values.len())
    {
        Some(&index) => Err(format!(
            "The puzzle is broken: fixed slot {} is past its last value.",
            index as u128 + 1
        )),
        None => Ok(()),
    }
}

/// Slots are numbered from 1 in messages, as players count them. Indexes widen
/// to u128 before the add so usize::MAX can't overflow or wrap to 0.
fn describe(error: &InputError) -> String {
    match error {
        InputError::WrongLength { expected, got } => {
            format!("The arrangement has the wrong length: it needs {expected} values, not {got}.")
        }
        InputError::FixedValueMoved { index } => format!(
            "A fixed value moved: slot {} is fixed and has to keep its value.",
            *index as u128 + 1
        ),
        InputError::NotAPermutation => "The arrangement has to be a permutation of the puzzle's \
             values: use each value exactly once."
            .to_owned(),
    }
}
