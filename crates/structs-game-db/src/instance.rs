//! Template lookups and scoring for [`PuzzleInstance`].

use crate::error::DbError;
use crate::model::{PuzzleInstance, PuzzleSolution};
use structs_puzzles::avl_rotations::{self, AvlRotations};
use structs_puzzles::bst_forced_order::{self, BstForcedOrder};
use structs_puzzles::bubble::{self, Bubble};
use structs_puzzles::insertion_beats_merge::{self, InsertionBeatsMerge};
use structs_puzzles::linked_list_index_drift::{self, LinkedListIndexDrift};
use structs_puzzles::quicksort::{self, Quicksort};
use structs_puzzles::upset_bst_beats_avl::{self, UpsetBstBeatsAvl};
use structs_puzzles::{InputError, ScoreDirection, Template};

impl PuzzleInstance {
    /// The template id ([`Template::ID`]) this puzzle belongs to.
    pub fn template_id(&self) -> &'static str {
        match self {
            Self::Quicksort { .. } => Quicksort::ID,
            Self::Bubble { .. } => Bubble::ID,
            Self::InsertionBeatsMerge { .. } => InsertionBeatsMerge::ID,
            Self::AvlRotations { .. } => AvlRotations::ID,
            Self::BstForcedOrder { .. } => BstForcedOrder::ID,
            Self::UpsetBstBeatsAvl { .. } => UpsetBstBeatsAvl::ID,
            Self::LinkedListIndexDrift { .. } => LinkedListIndexDrift::ID,
        }
    }

    /// Whether higher or lower solved scores rank better for this template.
    pub fn score_direction(&self) -> ScoreDirection {
        match self {
            Self::Quicksort { .. } => Quicksort::DIRECTION,
            Self::Bubble { .. } => Bubble::DIRECTION,
            Self::InsertionBeatsMerge { .. } => InsertionBeatsMerge::DIRECTION,
            Self::AvlRotations { .. } => AvlRotations::DIRECTION,
            Self::BstForcedOrder { .. } => BstForcedOrder::DIRECTION,
            Self::UpsetBstBeatsAvl { .. } => UpsetBstBeatsAvl::DIRECTION,
            Self::LinkedListIndexDrift { .. } => LinkedListIndexDrift::DIRECTION,
        }
    }

    /// Checks that this instance has a valid playable shape the browser parser
    /// will accept.
    pub fn validate_shape(&self) -> Result<(), DbError> {
        match self {
            Self::Quicksort { values, fixed }
            | Self::Bubble { values, fixed, .. }
            | Self::InsertionBeatsMerge { values, fixed }
            | Self::AvlRotations { values, fixed }
            | Self::UpsetBstBeatsAvl { values, fixed } => {
                if values.is_empty() {
                    return Err(DbError::InvalidData(format!(
                        "{} requires at least one value",
                        self.template_id()
                    )));
                }
                if let Some(&slot) = fixed.iter().find(|&&slot| slot >= values.len()) {
                    return Err(DbError::InvalidData(format!(
                        "{} fixed slot {slot} is out of range for {} values",
                        self.template_id(),
                        values.len()
                    )));
                }
                Ok(())
            }
            Self::BstForcedOrder {
                values,
                target_tree,
            } => {
                if values.is_empty() {
                    return Err(DbError::InvalidData(
                        "bst-forced-order requires at least one value".to_owned(),
                    ));
                }
                if !bst_forced_order::is_valid_target_tree(values, target_tree) {
                    return Err(DbError::InvalidData(
                        "bst-forced-order targetTree must be a canonical BST preorder of the \
                         distinct keys in values"
                            .to_owned(),
                    ));
                }
                Ok(())
            }
            Self::LinkedListIndexDrift { .. } => Ok(()),
        }
    }

    /// The template's rules text for this puzzle ([`Template::rules`]).
    pub fn rules(&self) -> String {
        match self.clone() {
            Self::Quicksort { values, fixed } => {
                Quicksort.rules(&quicksort::Instance { values, fixed })
            }
            Self::Bubble {
                values,
                fixed,
                target_passes,
            } => Bubble.rules(&bubble::Instance {
                values,
                fixed,
                target_passes,
            }),
            Self::InsertionBeatsMerge { values, fixed } => {
                InsertionBeatsMerge.rules(&insertion_beats_merge::Instance { values, fixed })
            }
            Self::AvlRotations { values, fixed } => {
                AvlRotations.rules(&avl_rotations::Instance { values, fixed })
            }
            Self::BstForcedOrder {
                values,
                target_tree,
            } => BstForcedOrder.rules(&bst_forced_order::Instance {
                values,
                target_tree,
            }),
            Self::UpsetBstBeatsAvl { values, fixed } => {
                UpsetBstBeatsAvl.rules(&upset_bst_beats_avl::Instance { values, fixed })
            }
            Self::LinkedListIndexDrift { start, target } => {
                LinkedListIndexDrift.rules(&linked_list_index_drift::Instance { start, target })
            }
        }
    }

    /// Scores `solution` with the template's [`Template::solved_score`]:
    /// `Some(score)` when it solves the puzzle, `None` when it does not.
    ///
    /// Returns [`DbError::InvalidData`] when the solution is the wrong kind
    /// for this template, or when the template rejects it as invalid input.
    pub fn score_solution(&self, solution: &PuzzleSolution) -> Result<Option<u32>, DbError> {
        match (self.clone(), solution) {
            (Self::LinkedListIndexDrift { start, target }, PuzzleSolution::Operations(ops)) => {
                let inst = linked_list_index_drift::Instance { start, target };
                LinkedListIndexDrift
                    .solved_score(&inst, ops)
                    .map_err(invalid_input)
            }
            (Self::LinkedListIndexDrift { .. }, PuzzleSolution::Arrangement(_)) => {
                Err(wrong_kind(self, "operations", "an arrangement"))
            }
            (_, PuzzleSolution::Operations(_)) => {
                Err(wrong_kind(self, "an arrangement", "operations"))
            }
            (instance, PuzzleSolution::Arrangement(input)) => score_arrangement(instance, input),
        }
    }
}

/// Scores an arrangement against an array or tree template.
fn score_arrangement(instance: PuzzleInstance, input: &Vec<i32>) -> Result<Option<u32>, DbError> {
    let result = match instance {
        PuzzleInstance::Quicksort { values, fixed } => {
            Quicksort.solved_score(&quicksort::Instance { values, fixed }, input)
        }
        PuzzleInstance::Bubble {
            values,
            fixed,
            target_passes,
        } => Bubble.solved_score(
            &bubble::Instance {
                values,
                fixed,
                target_passes,
            },
            input,
        ),
        PuzzleInstance::InsertionBeatsMerge { values, fixed } => InsertionBeatsMerge
            .solved_score(&insertion_beats_merge::Instance { values, fixed }, input),
        PuzzleInstance::AvlRotations { values, fixed } => {
            AvlRotations.solved_score(&avl_rotations::Instance { values, fixed }, input)
        }
        PuzzleInstance::BstForcedOrder {
            values,
            target_tree,
        } => BstForcedOrder.solved_score(
            &bst_forced_order::Instance {
                values,
                target_tree,
            },
            input,
        ),
        PuzzleInstance::UpsetBstBeatsAvl { values, fixed } => {
            UpsetBstBeatsAvl.solved_score(&upset_bst_beats_avl::Instance { values, fixed }, input)
        }
        PuzzleInstance::LinkedListIndexDrift { .. } => {
            return Err(wrong_kind(&instance, "operations", "an arrangement"));
        }
    };
    result.map_err(invalid_input)
}

/// Maps a template's input rejection to [`DbError::InvalidData`].
fn invalid_input(input_error: InputError) -> DbError {
    DbError::InvalidData(format!("{input_error:?}"))
}

/// The error for a solution of the wrong kind for its template.
fn wrong_kind(instance: &PuzzleInstance, expected: &str, got: &str) -> DbError {
    DbError::InvalidData(format!(
        "{} takes {expected} as its solution, got {got}",
        instance.template_id()
    ))
}
