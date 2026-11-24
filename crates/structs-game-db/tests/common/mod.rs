//! Fixtures shared by the `structs-game-db` integration tests, built from the
//! real `structs_puzzles` templates so every score is the template's own.
#![allow(dead_code)]

use chrono::NaiveDate;
use structs_game_db::{DailyPuzzleRecord, NewDailyPuzzle, PuzzleInstance, PuzzleSolution};
use structs_puzzles::avl_rotations::AvlRotations;
use structs_puzzles::bst_forced_order::BstForcedOrder;
use structs_puzzles::bubble::Bubble;
use structs_puzzles::insertion_beats_merge::InsertionBeatsMerge;
use structs_puzzles::linked_list_index_drift::LinkedListIndexDrift;
use structs_puzzles::quicksort::Quicksort;
use structs_puzzles::upset_bst_beats_avl::UpsetBstBeatsAvl;
use structs_puzzles::{SearchSpace, Template};

/// One generated instance with candidate solutions scored by the template.
#[derive(Debug, Clone)]
pub struct Sample {
    pub template_id: &'static str,
    pub seed: u64,
    pub instance: PuzzleInstance,
    pub rules: String,
    /// Each candidate with the template's own `solved_score` for it.
    pub scored: Vec<(PuzzleSolution, Option<u32>)>,
}

impl Sample {
    /// The first candidate that solves the puzzle, with its score.
    pub fn solved(&self) -> (PuzzleSolution, u32) {
        self.scored
            .iter()
            .find_map(|(solution, score)| score.map(|score| (solution.clone(), score)))
            .unwrap_or_else(|| {
                panic!(
                    "{} seed {}: no solved candidate",
                    self.template_id, self.seed
                )
            })
    }

    /// The first valid candidate that does not solve the puzzle, if any.
    pub fn unsolved(&self) -> Option<PuzzleSolution> {
        self.scored
            .iter()
            .find(|(_, score)| score.is_none())
            .map(|(solution, _)| solution.clone())
    }
}

fn sample<T>(template: T, seed: u64, wrap: fn(T::Input) -> PuzzleSolution) -> Sample
where
    T: Template,
    PuzzleInstance: From<T::Instance>,
    T::Instance: Clone,
{
    let instance = template.generate(seed);
    let mut inputs: Vec<T::Input> = template
        .shortcuts(&instance)
        .into_iter()
        .map(|shortcut| shortcut.input)
        .collect();
    inputs.extend((0..16).filter_map(|s| template.random_input(&instance, s)));
    if let SearchSpace::Exhaustive(all) = template.search_space(&instance) {
        inputs.extend(all.take(2000));
    }
    let scored = inputs
        .into_iter()
        .map(|input| {
            let score = template
                .solved_score(&instance, &input)
                .unwrap_or_else(|e| {
                    panic!("{} seed {seed}: template candidate invalid: {e:?}", T::ID)
                });
            (wrap(input), score)
        })
        .collect();
    Sample {
        template_id: T::ID,
        seed,
        rules: template.rules(&instance),
        instance: PuzzleInstance::from(instance),
        scored,
    }
}

/// The seven launch template ids, in the order [`samples`] returns them.
pub const TEMPLATE_IDS: [&str; 7] = [
    "quicksort-most-comparisons",
    "bubble-exact-passes",
    "insertion-beats-merge",
    "avl-most-rotations",
    "bst-forced-order",
    "upset-bst-beats-avl",
    "linked-list-index-drift",
];

/// One sample per launch template, generated from `seeds` in template order.
pub fn samples(seeds: [u64; 7]) -> Vec<Sample> {
    let arrangement = PuzzleSolution::Arrangement as fn(Vec<i32>) -> PuzzleSolution;
    vec![
        sample(Quicksort, seeds[0], arrangement),
        sample(Bubble, seeds[1], arrangement),
        sample(InsertionBeatsMerge, seeds[2], arrangement),
        sample(AvlRotations, seeds[3], arrangement),
        sample(BstForcedOrder, seeds[4], arrangement),
        sample(UpsetBstBeatsAvl, seeds[5], arrangement),
        sample(LinkedListIndexDrift, seeds[6], PuzzleSolution::Operations),
    ]
}

/// A valid puzzle for `date` whose best solution is the sample's first solved candidate.
pub fn new_puzzle(sample: &Sample, date: NaiveDate) -> NewDailyPuzzle {
    let (best_solution, best_score) = sample.solved();
    NewDailyPuzzle {
        puzzle_date: date,
        template_version: 1,
        instance: sample.instance.clone(),
        rules: sample.rules.clone(),
        seed: sample.seed,
        goal: best_score,
        best_score,
        best_solution,
        bot_goal_rate: 0.25,
        bot_best_rate: 0.125,
    }
}

/// The record the store should hold for `puzzle` once it is numbered `number`.
pub fn expected_record(puzzle: &NewDailyPuzzle, number: u32) -> DailyPuzzleRecord {
    DailyPuzzleRecord {
        puzzle_date: puzzle.puzzle_date,
        number,
        template_version: puzzle.template_version,
        instance: puzzle.instance.clone(),
        rules: puzzle.rules.clone(),
        seed: puzzle.seed,
        goal: puzzle.goal,
        best_score: puzzle.best_score,
        best_solution: puzzle.best_solution.clone(),
        bot_goal_rate: puzzle.bot_goal_rate,
        bot_best_rate: puzzle.bot_best_rate,
    }
}

pub fn date(y: i32, m: u32, d: u32) -> NaiveDate {
    NaiveDate::from_ymd_opt(y, m, d).expect("valid test date")
}
