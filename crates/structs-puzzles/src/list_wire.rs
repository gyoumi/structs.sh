//! Scoring a `linked-list-index-drift` request for [`crate::wire`].

use crate::linked_list_index_drift::{self, LinkedListIndexDrift};
use crate::request::ListRequest;
use crate::wire::describe;
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct IndexDriftReply {
    solved: bool,
    score: Option<u32>,
    operations: u32,
    nodes_walked: u32,
    cost: u32,
}

pub(crate) fn index_drift(request: ListRequest) -> Result<String, String> {
    let instance = linked_list_index_drift::Instance {
        start: request.start,
        target: request.target,
    };
    let outcome = LinkedListIndexDrift
        .evaluate(&instance, &request.operations)
        .map_err(|error| describe(&error))?;
    serde_json::to_string(&IndexDriftReply {
        solved: outcome.solved,
        score: outcome.solved.then_some(outcome.cost),
        operations: outcome.operations,
        nodes_walked: outcome.nodes_walked,
        cost: outcome.cost,
    })
    .map_err(|error| format!("The puzzle reply could not be written: {error}."))
}
