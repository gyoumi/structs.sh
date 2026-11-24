use std::cmp::Ordering;

use structs_puzzles::{
    ScoreDirection, Template, avl_rotations, bst_forced_order, bubble, insertion_beats_merge,
    linked_list_index_drift::{self, LinkedListIndexDrift, Operation},
    quicksort, upset_bst_beats_avl,
};

fn best_through_trait<T: Template>(
    template: &T,
    instance: &T::Instance,
    candidates: &[T::Input],
) -> Option<u32> {
    candidates
        .iter()
        .filter_map(|input| template.solved_score(instance, input).ok().flatten())
        .max_by(|&a, &b| T::DIRECTION.cmp_outcomes(Some(a), Some(b)))
}

#[test]
fn score_direction_ranks_solved_ahead_of_unsolved_and_respects_direction() {
    assert_eq!(
        ScoreDirection::LowerWins.cmp_outcomes(Some(5), None),
        Ordering::Greater
    );
    assert_eq!(
        ScoreDirection::LowerWins.cmp_outcomes(Some(0), None),
        Ordering::Greater
    );
    assert_eq!(
        ScoreDirection::LowerWins.cmp_outcomes(Some(5), Some(14)),
        Ordering::Greater
    );
    assert_eq!(
        ScoreDirection::HigherWins.cmp_outcomes(Some(0), None),
        Ordering::Greater
    );
    assert_eq!(
        ScoreDirection::HigherWins.cmp_outcomes(Some(10), Some(4)),
        Ordering::Greater
    );
    assert_eq!(
        ScoreDirection::LowerWins.cmp_outcomes(None, None),
        Ordering::Equal
    );
}

#[test]
fn index_drift_ranks_lower_solved_cost_ahead_of_unsolved_and_distinguishes_zero_cost() {
    assert_eq!(LinkedListIndexDrift::DIRECTION, ScoreDirection::LowerWins);
    let drift = linked_list_index_drift::Instance {
        start: vec![8, 3, 6, 1],
        target: vec![3, 6, 5, 1],
    };
    let unsolved = vec![Operation::Insert { value: 5, index: 0 }];
    let cheap = vec![
        Operation::Delete { index: 0 },
        Operation::Insert { value: 5, index: 2 },
    ];
    let costly = vec![
        Operation::Delete { index: 3 },
        Operation::Delete { index: 0 },
        Operation::Insert { value: 5, index: 2 },
        Operation::Insert { value: 1, index: 3 },
    ];

    assert_eq!(
        LinkedListIndexDrift.solved_score(&drift, &unsolved),
        Ok(None)
    );
    assert_eq!(
        LinkedListIndexDrift.solved_score(&drift, &cheap),
        Ok(Some(5))
    );
    assert_eq!(
        LinkedListIndexDrift.solved_score(&drift, &costly),
        Ok(Some(14))
    );
    assert_eq!(
        best_through_trait(&LinkedListIndexDrift, &drift, &[unsolved, costly, cheap]),
        Some(5)
    );

    let already_equal = linked_list_index_drift::Instance {
        start: vec![1, 2],
        target: vec![1, 2],
    };
    assert_eq!(
        LinkedListIndexDrift.solved_score(&already_equal, &vec![]),
        Ok(Some(0))
    );
    assert_eq!(LinkedListIndexDrift.solved_score(&drift, &vec![]), Ok(None));
}

#[test]
fn all_other_templates_use_higher_wins_and_report_unsolved_as_none() {
    assert_eq!(quicksort::Quicksort::DIRECTION, ScoreDirection::HigherWins);
    assert_eq!(
        avl_rotations::AvlRotations::DIRECTION,
        ScoreDirection::HigherWins
    );
    assert_eq!(bubble::Bubble::DIRECTION, ScoreDirection::HigherWins);
    assert_eq!(
        insertion_beats_merge::InsertionBeatsMerge::DIRECTION,
        ScoreDirection::HigherWins
    );
    assert_eq!(
        bst_forced_order::BstForcedOrder::DIRECTION,
        ScoreDirection::HigherWins
    );
    assert_eq!(
        upset_bst_beats_avl::UpsetBstBeatsAvl::DIRECTION,
        ScoreDirection::HigherWins
    );

    let already_sorted = bubble::Instance {
        values: vec![1, 2, 3],
        fixed: vec![],
        target_passes: 1,
    };
    assert_eq!(
        bubble::Bubble.solved_score(&already_sorted, &vec![1, 2, 3]),
        Ok(Some(0))
    );
    assert_eq!(
        bubble::Bubble.solved_score(&already_sorted, &vec![3, 2, 1]),
        Ok(None)
    );

    let singleton_ins = insertion_beats_merge::Instance {
        values: vec![1],
        fixed: vec![],
    };
    assert_eq!(
        insertion_beats_merge::InsertionBeatsMerge.solved_score(&singleton_ins, &vec![1]),
        Ok(None)
    );

    let forced = bst_forced_order::Instance {
        values: vec![1, 2, 3],
        target_tree: vec![2, 1, 3],
    };
    assert_eq!(
        bst_forced_order::BstForcedOrder.solved_score(&forced, &vec![1, 2, 3]),
        Ok(None)
    );
    assert_eq!(
        bst_forced_order::BstForcedOrder.solved_score(&forced, &vec![2, 1, 3]),
        Ok(Some(2))
    );

    let tie_upset = upset_bst_beats_avl::Instance {
        values: vec![1, 2],
        fixed: vec![],
    };
    assert_eq!(
        upset_bst_beats_avl::UpsetBstBeatsAvl.solved_score(&tie_upset, &vec![1, 2]),
        Ok(None)
    );
}
