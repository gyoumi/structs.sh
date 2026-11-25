//! Challenge types stored in, and served from, the `daily_challenges` table.

use chrono::NaiveDate;
use daily_challenges::linked_list_index_drift::Operation;
use daily_challenges::{
    avl_rotations, bst_forced_order, bubble, insertion_beats_merge, linked_list_index_drift,
    quicksort, upset_bst_beats_avl,
};
use serde::{Deserialize, Serialize};

/// One generated challenge, tagged with its template id when serialized.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "template")]
pub enum ChallengeInstance {
    /// A `quicksort-most-comparisons` challenge.
    #[serde(rename = "quicksort-most-comparisons")]
    Quicksort { values: Vec<i32>, fixed: Vec<usize> },
    /// A `bubble-exact-passes` challenge.
    #[serde(rename = "bubble-exact-passes", rename_all = "camelCase")]
    Bubble {
        values: Vec<i32>,
        fixed: Vec<usize>,
        target_passes: u32,
    },
    /// An `insertion-beats-merge` challenge.
    #[serde(rename = "insertion-beats-merge")]
    InsertionBeatsMerge { values: Vec<i32>, fixed: Vec<usize> },
    /// An `avl-most-rotations` challenge.
    #[serde(rename = "avl-most-rotations")]
    AvlRotations { values: Vec<i32>, fixed: Vec<usize> },
    /// A `bst-forced-order` challenge.
    #[serde(rename = "bst-forced-order", rename_all = "camelCase")]
    BstForcedOrder {
        values: Vec<i32>,
        target_tree: Vec<i32>,
    },
    /// An `upset-bst-beats-avl` challenge.
    #[serde(rename = "upset-bst-beats-avl")]
    UpsetBstBeatsAvl { values: Vec<i32>, fixed: Vec<usize> },
    /// A `linked-list-index-drift` challenge.
    #[serde(rename = "linked-list-index-drift")]
    LinkedListIndexDrift { start: Vec<i32>, target: Vec<i32> },
}

/// A submitted answer: an arrangement of values, or a list of operations.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value", rename_all = "lowercase")]
pub enum ChallengeSolution {
    /// The input order for an array or tree template.
    Arrangement(Vec<i32>),
    /// The operations for the linked list template.
    Operations(Vec<Operation>),
}

/// The part of a daily challenge that players may see.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PublicChallenge {
    /// The challenge's 1-based sequence number.
    pub number: u32,
    /// The challenge itself, flattened into this object.
    #[serde(flatten)]
    pub instance: ChallengeInstance,
    /// The score to reach.
    pub goal: u32,
    /// The day the challenge runs.
    pub date: NaiveDate,
}

/// A challenge to schedule for a day; the store assigns its number.
#[derive(Debug, Clone, PartialEq)]
pub struct NewDailyChallenge {
    /// The day the challenge runs.
    pub challenge_date: NaiveDate,
    /// The version of the template that generated it, from 1.
    pub template_version: u32,
    /// The challenge itself.
    pub instance: ChallengeInstance,
    /// The rules text shown with it.
    pub rules: String,
    /// The seed that generated it.
    pub seed: u64,
    /// The score to reach.
    pub goal: u32,
    /// The best score found.
    pub best_score: u32,
    /// A solution that scores [`best_score`](Self::best_score).
    pub best_solution: ChallengeSolution,
    /// Share of bot attempts that reached the goal, in `0.0..=1.0`.
    pub bot_goal_rate: f64,
    /// Share of bot attempts that reached the best score, in `0.0..=1.0`.
    pub bot_best_rate: f64,
}

/// A stored daily challenge, private fields included.
#[derive(Debug, Clone, PartialEq)]
pub struct DailyChallengeRecord {
    /// The day the challenge runs.
    pub challenge_date: NaiveDate,
    /// The challenge's 1-based sequence number.
    pub number: u32,
    /// The version of the template that generated it.
    pub template_version: u32,
    /// The challenge itself.
    pub instance: ChallengeInstance,
    /// The rules text shown with it.
    pub rules: String,
    /// The seed that generated it.
    pub seed: u64,
    /// The score to reach.
    pub goal: u32,
    /// The best score found.
    pub best_score: u32,
    /// A solution that scores [`best_score`](Self::best_score).
    pub best_solution: ChallengeSolution,
    /// Share of bot attempts that reached the goal.
    pub bot_goal_rate: f64,
    /// Share of bot attempts that reached the best score.
    pub bot_best_rate: f64,
}

impl DailyChallengeRecord {
    /// The fields of this record that players may see.
    pub fn to_public(&self) -> PublicChallenge {
        PublicChallenge {
            number: self.number,
            instance: self.instance.clone(),
            goal: self.goal,
            date: self.challenge_date,
        }
    }
}

/// What [`insert_challenge`](crate::insert_challenge) did.
#[derive(Debug, Clone, PartialEq)]
pub enum InsertOutcome {
    /// The challenge was stored as this new record.
    Inserted(DailyChallengeRecord),
    /// A challenge already ran on that day; this is the stored one, unchanged.
    AlreadyScheduled(DailyChallengeRecord),
}

impl From<quicksort::Instance> for ChallengeInstance {
    fn from(i: quicksort::Instance) -> Self {
        Self::Quicksort {
            values: i.values,
            fixed: i.fixed,
        }
    }
}

impl From<bubble::Instance> for ChallengeInstance {
    fn from(i: bubble::Instance) -> Self {
        Self::Bubble {
            values: i.values,
            fixed: i.fixed,
            target_passes: i.target_passes,
        }
    }
}

impl From<insertion_beats_merge::Instance> for ChallengeInstance {
    fn from(i: insertion_beats_merge::Instance) -> Self {
        Self::InsertionBeatsMerge {
            values: i.values,
            fixed: i.fixed,
        }
    }
}

impl From<avl_rotations::Instance> for ChallengeInstance {
    fn from(i: avl_rotations::Instance) -> Self {
        Self::AvlRotations {
            values: i.values,
            fixed: i.fixed,
        }
    }
}

impl From<bst_forced_order::Instance> for ChallengeInstance {
    fn from(i: bst_forced_order::Instance) -> Self {
        Self::BstForcedOrder {
            values: i.values,
            target_tree: i.target_tree,
        }
    }
}

impl From<upset_bst_beats_avl::Instance> for ChallengeInstance {
    fn from(i: upset_bst_beats_avl::Instance) -> Self {
        Self::UpsetBstBeatsAvl {
            values: i.values,
            fixed: i.fixed,
        }
    }
}

impl From<linked_list_index_drift::Instance> for ChallengeInstance {
    fn from(i: linked_list_index_drift::Instance) -> Self {
        Self::LinkedListIndexDrift {
            start: i.start,
            target: i.target,
        }
    }
}
