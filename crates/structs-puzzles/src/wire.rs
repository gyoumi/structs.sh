//! The JSON the browser sends to the wasm build, and the replies it gets.
//!
//! Request (UTF-8 JSON):
//! `{"template": "quicksort-most-comparisons", "values": [..], "fixed": [..], "arrangement": [..]}`
//!
//! Success reply: `{"score": 12}`. Failure reply: a plain-English message a
//! player can read, as UTF-8 text.

use crate::quicksort::{Instance, Quicksort};
use crate::{InputError, Template};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    template: String,
    values: Vec<i32>,
    fixed: Vec<usize>,
    arrangement: Vec<i32>,
}

/// Decodes `request`, scores it, and returns the JSON reply, or the message
/// to show the player.
pub fn score_request(request: &[u8]) -> Result<String, String> {
    let request: Request = serde_json::from_slice(request)
        .map_err(|error| format!("The puzzle request could not be read: {error}."))?;
    let score = score(&request)?;
    Ok(format!("{{\"score\":{score}}}"))
}

fn score(request: &Request) -> Result<u32, String> {
    if request.template != Quicksort::ID {
        return Err(format!("Unknown puzzle template \"{}\".", request.template));
    }
    if let Some(&index) = request
        .fixed
        .iter()
        .find(|&&index| index >= request.values.len())
    {
        return Err(format!(
            "The puzzle is broken: fixed slot {} is past its last value.",
            index as u64 + 1
        ));
    }
    let instance = Instance {
        values: request.values.clone(),
        fixed: request.fixed.clone(),
    };
    Quicksort
        .score(&instance, &request.arrangement)
        .map_err(|error| describe(&error))
}

/// Slots are numbered from 1 in messages, as players count them. Indexes widen
/// to u64 before the add so a huge index can't wrap to 0 on wasm32.
fn describe(error: &InputError) -> String {
    match error {
        InputError::WrongLength { expected, got } => {
            format!("The arrangement has the wrong length: it needs {expected} values, not {got}.")
        }
        InputError::FixedValueMoved { index } => format!(
            "A fixed value moved: slot {} is fixed and has to keep its value.",
            *index as u64 + 1
        ),
        InputError::NotAPermutation => "The arrangement has to be a permutation of the puzzle's \
             values: use each value exactly once."
            .to_owned(),
    }
}
