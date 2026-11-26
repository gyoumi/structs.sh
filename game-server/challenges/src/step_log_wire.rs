//! Running a step log request for [`crate::wire`].

use crate::hash_table::{self, HashOp, HashSlot};
use serde::Deserialize;
use serde::de::DeserializeOwned;
use serde_json::Value;

/// A request as sent, tagged by `algorithm`. Fields stay raw JSON until
/// [`field`] reads them, so a field of the wrong type is named in its error.
#[derive(Deserialize)]
#[serde(tag = "algorithm", deny_unknown_fields)]
enum StepLogRequest {
    #[serde(rename = "hash-table-linear")]
    HashTableLinear {
        capacity: Value,
        slots: Value,
        op: Value,
    },
}

/// Decodes `request`, runs its algorithm, and returns the step log as JSON,
/// or the message to show.
pub fn step_log_request(request: &[u8]) -> Result<String, String> {
    let request = std::str::from_utf8(request)
        .map_err(|error| format!("The step log request is not UTF-8 text: {error}."))?;
    let request: Value = serde_json::from_str(request).map_err(unreadable)?;
    if !request.is_object() {
        return Err("The step log request has to be a JSON object.".to_owned());
    }
    let StepLogRequest::HashTableLinear {
        capacity,
        slots,
        op,
    } = serde_json::from_value(request).map_err(unreadable)?;
    let capacity: usize = field("capacity", capacity)?;
    let slots: Vec<HashSlot> = field("slots", slots)?;
    let op: HashOp = field("op", op)?;
    let result = hash_table::run(capacity, &slots, op)?;
    serde_json::to_string(&result)
        .map_err(|error| format!("The step log reply could not be written: {error}."))
}

fn unreadable(error: serde_json::Error) -> String {
    format!("The step log request could not be read: {error}.")
}

fn field<T: DeserializeOwned>(name: &str, value: Value) -> Result<T, String> {
    serde_json::from_value(value)
        .map_err(|error| format!("The step log request's `{name}` is invalid: {error}."))
}
