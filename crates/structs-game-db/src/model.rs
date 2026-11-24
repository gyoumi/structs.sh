//! Puzzle types stored in, and served from, the `daily_puzzles` table.

use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use structs_puzzles::linked_list_index_drift::Operation;
use structs_puzzles::{
    avl_rotations, bst_forced_order, bubble, insertion_beats_merge, linked_list_index_drift,
    quicksort, upset_bst_beats_avl,
};

/// One generated puzzle, tagged with its template id when serialized.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "template")]
pub enum PuzzleInstance {
    /// A `quicksort-most-comparisons` puzzle.
    #[serde(rename = "quicksort-most-comparisons")]
    Quicksort { values: Vec<i32>, fixed: Vec<usize> },
    /// A `bubble-exact-passes` puzzle.
    #[serde(rename = "bubble-exact-passes", rename_all = "camelCase")]
    Bubble {
        values: Vec<i32>,
        fixed: Vec<usize>,
        target_passes: u32,
    },
    /// An `insertion-beats-merge` puzzle.
    #[serde(rename = "insertion-beats-merge")]
    InsertionBeatsMerge { values: Vec<i32>, fixed: Vec<usize> },
    /// An `avl-most-rotations` puzzle.
    #[serde(rename = "avl-most-rotations")]
    AvlRotations { values: Vec<i32>, fixed: Vec<usize> },
    /// A `bst-forced-order` puzzle.
    #[serde(rename = "bst-forced-order", rename_all = "camelCase")]
    BstForcedOrder {
        values: Vec<i32>,
        target_tree: Vec<i32>,
    },
    /// An `upset-bst-beats-avl` puzzle.
    #[serde(rename = "upset-bst-beats-avl")]
    UpsetBstBeatsAvl { values: Vec<i32>, fixed: Vec<usize> },
    /// A `linked-list-index-drift` puzzle.
    #[serde(rename = "linked-list-index-drift")]
    LinkedListIndexDrift { start: Vec<i32>, target: Vec<i32> },
}

/// A submitted answer: an arrangement of values, or a list of operations.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value", rename_all = "lowercase")]
pub enum PuzzleSolution {
    /// The input order for an array or tree template.
    Arrangement(Vec<i32>),
    /// The operations for the linked list template.
    Operations(Vec<Operation>),
}

/// The part of a daily puzzle that players may see.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PublicPuzzle {
    /// The puzzle's 1-based sequence number.
    pub number: u32,
    /// The puzzle itself, flattened into this object.
    #[serde(flatten)]
    pub instance: PuzzleInstance,
    /// The score to reach.
    pub par: u32,
    /// The day the puzzle runs.
    pub date: NaiveDate,
}

/// A puzzle to schedule for a day; the store assigns its number.
#[derive(Debug, Clone, PartialEq)]
pub struct NewDailyPuzzle {
    /// The day the puzzle runs.
    pub puzzle_date: NaiveDate,
    /// The version of the template that generated it, from 1.
    pub template_version: u32,
    /// The puzzle itself.
    pub instance: PuzzleInstance,
    /// The rules text shown with it.
    pub rules: String,
    /// The seed that generated it.
    pub seed: u64,
    /// The score to reach (shown as par).
    pub goal: u32,
    /// The best score found.
    pub best_score: u32,
    /// A solution that scores [`best_score`](Self::best_score).
    pub best_solution: PuzzleSolution,
    /// Share of bot attempts that reached the goal, in `0.0..=1.0`.
    pub bot_goal_rate: f64,
    /// Share of bot attempts that reached the best score, in `0.0..=1.0`.
    pub bot_best_rate: f64,
}

/// A stored daily puzzle, private fields included.
#[derive(Debug, Clone, PartialEq)]
pub struct DailyPuzzleRecord {
    /// The day the puzzle runs.
    pub puzzle_date: NaiveDate,
    /// The puzzle's 1-based sequence number.
    pub number: u32,
    /// The version of the template that generated it.
    pub template_version: u32,
    /// The puzzle itself.
    pub instance: PuzzleInstance,
    /// The rules text shown with it.
    pub rules: String,
    /// The seed that generated it.
    pub seed: u64,
    /// The score to reach (shown as par).
    pub goal: u32,
    /// The best score found.
    pub best_score: u32,
    /// A solution that scores [`best_score`](Self::best_score).
    pub best_solution: PuzzleSolution,
    /// Share of bot attempts that reached the goal.
    pub bot_goal_rate: f64,
    /// Share of bot attempts that reached the best score.
    pub bot_best_rate: f64,
}

impl DailyPuzzleRecord {
    /// The fields of this record that players may see.
    pub fn to_public(&self) -> PublicPuzzle {
        PublicPuzzle {
            number: self.number,
            instance: self.instance.clone(),
            par: self.goal,
            date: self.puzzle_date,
        }
    }
}

/// What [`insert_puzzle`](crate::insert_puzzle) did.
#[derive(Debug, Clone, PartialEq)]
pub enum InsertOutcome {
    /// The puzzle was stored as this new record.
    Inserted(DailyPuzzleRecord),
    /// A puzzle already ran on that day; this is the stored one, unchanged.
    AlreadyScheduled(DailyPuzzleRecord),
}

impl From<quicksort::Instance> for PuzzleInstance {
    fn from(i: quicksort::Instance) -> Self {
        Self::Quicksort {
            values: i.values,
            fixed: i.fixed,
        }
    }
}

impl From<bubble::Instance> for PuzzleInstance {
    fn from(i: bubble::Instance) -> Self {
        Self::Bubble {
            values: i.values,
            fixed: i.fixed,
            target_passes: i.target_passes,
        }
    }
}

impl From<insertion_beats_merge::Instance> for PuzzleInstance {
    fn from(i: insertion_beats_merge::Instance) -> Self {
        Self::InsertionBeatsMerge {
            values: i.values,
            fixed: i.fixed,
        }
    }
}

impl From<avl_rotations::Instance> for PuzzleInstance {
    fn from(i: avl_rotations::Instance) -> Self {
        Self::AvlRotations {
            values: i.values,
            fixed: i.fixed,
        }
    }
}

impl From<bst_forced_order::Instance> for PuzzleInstance {
    fn from(i: bst_forced_order::Instance) -> Self {
        Self::BstForcedOrder {
            values: i.values,
            target_tree: i.target_tree,
        }
    }
}

impl From<upset_bst_beats_avl::Instance> for PuzzleInstance {
    fn from(i: upset_bst_beats_avl::Instance) -> Self {
        Self::UpsetBstBeatsAvl {
            values: i.values,
            fixed: i.fixed,
        }
    }
}

impl From<linked_list_index_drift::Instance> for PuzzleInstance {
    fn from(i: linked_list_index_drift::Instance) -> Self {
        Self::LinkedListIndexDrift {
            start: i.start,
            target: i.target,
        }
    }
}
