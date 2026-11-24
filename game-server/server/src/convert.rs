//! Turning a stored public puzzle into the API's [`DailyChallenge`].

use daily_api::DailyChallenge;
use daily_db::{ChallengeInstance, PublicChallenge};

/// The API form of `puzzle`, with the same JSON fields.
pub fn to_daily_challenge(puzzle: PublicChallenge) -> DailyChallenge {
    let PublicChallenge {
        number,
        instance,
        goal,
        date,
    } = puzzle;
    match instance {
        ChallengeInstance::Quicksort { values, fixed } => DailyChallenge::Quicksort {
            number,
            values,
            fixed,
            goal,
            date,
        },
        ChallengeInstance::Bubble {
            values,
            fixed,
            target_passes,
        } => DailyChallenge::Bubble {
            number,
            values,
            fixed,
            target_passes,
            goal,
            date,
        },
        ChallengeInstance::InsertionBeatsMerge { values, fixed } => {
            DailyChallenge::InsertionBeatsMerge {
                number,
                values,
                fixed,
                goal,
                date,
            }
        }
        ChallengeInstance::AvlRotations { values, fixed } => DailyChallenge::AvlRotations {
            number,
            values,
            fixed,
            goal,
            date,
        },
        ChallengeInstance::BstForcedOrder {
            values,
            target_tree,
        } => DailyChallenge::BstForcedOrder {
            number,
            values,
            target_tree,
            goal,
            date,
        },
        ChallengeInstance::UpsetBstBeatsAvl { values, fixed } => DailyChallenge::UpsetBstBeatsAvl {
            number,
            values,
            fixed,
            goal,
            date,
        },
        ChallengeInstance::LinkedListIndexDrift { start, target } => {
            DailyChallenge::LinkedListIndexDrift {
                number,
                start,
                target,
                goal,
                date,
            }
        }
    }
}
