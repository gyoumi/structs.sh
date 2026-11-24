//! Turning a stored public puzzle into the API's [`DailyPuzzle`].

use structs_game_api::DailyPuzzle;
use structs_game_db::{PublicPuzzle, PuzzleInstance};

/// The API form of `puzzle`, with the same JSON fields.
pub fn to_daily_puzzle(puzzle: PublicPuzzle) -> DailyPuzzle {
    let PublicPuzzle {
        number,
        instance,
        par,
        date,
    } = puzzle;
    match instance {
        PuzzleInstance::Quicksort { values, fixed } => DailyPuzzle::Quicksort {
            number,
            values,
            fixed,
            par,
            date,
        },
        PuzzleInstance::Bubble {
            values,
            fixed,
            target_passes,
        } => DailyPuzzle::Bubble {
            number,
            values,
            fixed,
            target_passes,
            par,
            date,
        },
        PuzzleInstance::InsertionBeatsMerge { values, fixed } => DailyPuzzle::InsertionBeatsMerge {
            number,
            values,
            fixed,
            par,
            date,
        },
        PuzzleInstance::AvlRotations { values, fixed } => DailyPuzzle::AvlRotations {
            number,
            values,
            fixed,
            par,
            date,
        },
        PuzzleInstance::BstForcedOrder {
            values,
            target_tree,
        } => DailyPuzzle::BstForcedOrder {
            number,
            values,
            target_tree,
            par,
            date,
        },
        PuzzleInstance::UpsetBstBeatsAvl { values, fixed } => DailyPuzzle::UpsetBstBeatsAvl {
            number,
            values,
            fixed,
            par,
            date,
        },
        PuzzleInstance::LinkedListIndexDrift { start, target } => {
            DailyPuzzle::LinkedListIndexDrift {
                number,
                start,
                target,
                par,
                date,
            }
        }
    }
}
