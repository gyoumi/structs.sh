//! "Index drift" puzzle template.
//!
//! # Algorithm
//!
//! [`LinkedListIndexDrift::run`](crate::Template::run) applies the player's
//! insert and delete operations, in order, to the start list, as
//! `GraphicalLinkedList.ts` does. The list has no tail pointer.
//!
//! - `insert(value, index)` walks `min(index, length)` nodes, or none when
//!   `index` is 0 or the list is empty, then inserts `value` at
//!   `min(index, length)`.
//! - `delete(index)` walks `index + 1` nodes, then removes the node at
//!   `index`.
//!
//! # Step log and score
//!
//! - [`Step::Visit`] for every node the pointer lands on.
//! - [`Step::Insert`] for every inserted value, at its clamped index.
//! - [`Step::Delete`] for every removed value.
//!
//! A try costs 1 per operation plus 1 per visited node. It is solved when
//! the final list equals `target`. A solved try scores its cost, and an
//! unsolved try scores `0`.
//!
//! # Validation
//!
//! A delete whose index is not in the list at that point is rejected with
//! [`InputError::DeleteIndexOutOfRange`].

use crate::validate::count;
use crate::{InputError, Template};
use serde::{Deserialize, Serialize};

/// Index drift puzzle template (`ID = "linked-list-index-drift"`).
pub struct LinkedListIndexDrift;

/// An index drift puzzle instance.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Instance {
    /// The list the operations start from, front to back.
    pub start: Vec<i32>,
    /// The list the operations have to leave, front to back.
    pub target: Vec<i32>,
}

/// One operation a player submits.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase", deny_unknown_fields)]
pub enum Operation {
    /// Insert `value` at `index`, clamped to the list's length.
    Insert { value: i32, index: usize },
    /// Delete the node at `index`.
    Delete { index: usize },
}

/// One recorded event while the operations run.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Step {
    /// The pointer landed on the node at `index`, holding `value`.
    Visit { index: usize, value: i32 },
    /// `value` was inserted at `index`.
    Insert { value: i32, index: usize },
    /// The node at `index`, holding `value`, was removed.
    Delete { index: usize, value: i32 },
}

/// What one try did.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Outcome {
    /// Whether `final_list` equals the instance's `target`.
    pub solved: bool,
    /// Operations run.
    pub operations: u32,
    /// Nodes the pointer landed on, across every operation.
    pub nodes_walked: u32,
    /// `operations + nodes_walked`.
    pub cost: u32,
    /// The list the operations left, front to back.
    pub final_list: Vec<i32>,
}

impl LinkedListIndexDrift {
    /// Runs `input` on the start list and reports its cost and whether it
    /// reached the target.
    pub fn evaluate(
        &self,
        instance: &Instance,
        input: &[Operation],
    ) -> Result<Outcome, InputError> {
        let (walked, final_list) = apply(&instance.start, input, None)?;
        let operations = count(input.len());
        let nodes_walked = count(walked);
        Ok(Outcome {
            solved: final_list == instance.target,
            operations,
            nodes_walked,
            cost: operations.saturating_add(nodes_walked),
            final_list,
        })
    }
}

impl Template for LinkedListIndexDrift {
    type Instance = Instance;
    type Input = Vec<Operation>;
    type Step = Step;

    const ID: &'static str = "linked-list-index-drift";

    fn rules(&self, instance: &Self::Instance) -> String {
        format!(
            "Turn the start list {:?} into the target list {:?} with insert and delete by index. \
             Each operation costs 1, plus 1 for every node the pointer walks, so the cost is \
             operations + nodes walked. Reach the target list at the lowest cost.",
            instance.start, instance.target
        )
    }

    fn run(
        &self,
        instance: &Self::Instance,
        input: &Self::Input,
    ) -> Result<Vec<Self::Step>, InputError> {
        let mut steps = Vec::new();
        apply(&instance.start, input, Some(&mut steps))?;
        Ok(steps)
    }

    fn score(&self, instance: &Self::Instance, input: &Self::Input) -> Result<u32, InputError> {
        let outcome = self.evaluate(instance, input)?;
        Ok(if outcome.solved { outcome.cost } else { 0 })
    }
}

fn apply(
    start: &[i32],
    input: &[Operation],
    mut steps: Option<&mut Vec<Step>>,
) -> Result<(usize, Vec<i32>), InputError> {
    let mut list = start.to_vec();
    let mut walked: usize = 0;
    for (operation, &op) in input.iter().enumerate() {
        match op {
            Operation::Insert { value, index } => {
                let clamped = index.min(list.len());
                if index > 0 {
                    walked = walked.saturating_add(clamped);
                    if let Some(log) = steps.as_deref_mut() {
                        visit(&list, clamped, log);
                    }
                }
                list.insert(clamped, value);
                if let Some(log) = steps.as_deref_mut() {
                    log.push(Step::Insert {
                        value,
                        index: clamped,
                    });
                }
            }
            Operation::Delete { index } => {
                if index >= list.len() {
                    return Err(InputError::DeleteIndexOutOfRange {
                        operation,
                        index,
                        length: list.len(),
                    });
                }
                walked = walked.saturating_add(index + 1);
                if let Some(log) = steps.as_deref_mut() {
                    visit(&list, index + 1, log);
                }
                let value = list.remove(index);
                if let Some(log) = steps.as_deref_mut() {
                    log.push(Step::Delete { index, value });
                }
            }
        }
    }
    Ok((walked, list))
}

fn visit(list: &[i32], nodes: usize, steps: &mut Vec<Step>) {
    steps.extend(
        list.iter()
            .take(nodes)
            .enumerate()
            .map(|(index, &value)| Step::Visit { index, value }),
    );
}
