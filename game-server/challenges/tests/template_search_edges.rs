use daily_challenges::linked_list_index_drift::{
    Instance as DriftInstance, LinkedListIndexDrift as Drift, Operation,
};
use daily_challenges::{
    SearchSpace, Template, avl_rotations as avl, bst_forced_order as bst, bubble,
    insertion_beats_merge as ibm, quicksort as qs, upset_bst_beats_avl as upset,
};

fn collect_exhaustive<T: Template>(t: &T, inst: &T::Instance) -> Vec<T::Input> {
    match t.search_space(inst) {
        SearchSpace::Exhaustive(all) => all.collect(),
        SearchSpace::Incremental { .. } => panic!("expected Exhaustive search space"),
    }
}

macro_rules! assert_invalid_fixed_rejected {
    ($m:ident::$t:ident $(, $field:ident: $value:expr)*) => {{
        let inst = $m::Instance {
            values: vec![1, 2, 3],
            fixed: vec![3],
            $($field: $value,)*
        };
        assert!(collect_exhaustive(&$m::$t, &inst).is_empty());
        assert!($m::$t.shortcuts(&inst).is_empty());
        assert_eq!($m::$t.random_input(&inst, 7), None);
        assert_eq!($m::$t.random_neighbor(&inst, &vec![1, 2, 3], 7), None);

        let valid = $m::Instance {
            values: vec![1, 2, 3],
            fixed: vec![1, 1],
            $($field: $value,)*
        };
        assert_eq!(collect_exhaustive(&$m::$t, &valid).len(), 2);
        assert!(!$m::$t.shortcuts(&valid).is_empty());
        assert!($m::$t.random_input(&valid, 7).is_some());
        assert_eq!($m::$t.random_neighbor(&valid, &vec![2, 1, 3], 7), None);
    }};
}

#[test]
fn fixed_slot_templates_reject_out_of_range_fixed_and_invalid_neighbor_inputs() {
    assert_invalid_fixed_rejected!(qs::Quicksort);
    assert_invalid_fixed_rejected!(bubble::Bubble, target_passes: 2);
    assert_invalid_fixed_rejected!(ibm::InsertionBeatsMerge);
    assert_invalid_fixed_rejected!(avl::AvlRotations);
    assert_invalid_fixed_rejected!(upset::UpsetBstBeatsAvl);
}

#[test]
fn bst_forced_order_rejects_noncanonical_preorders_and_key_mismatches() {
    let cases = [
        bst::Instance {
            values: vec![1, 2, 3],
            target_tree: vec![2, 3, 1],
        },
        bst::Instance {
            values: vec![1, 2, 3],
            target_tree: vec![],
        },
        bst::Instance {
            values: vec![1, 2, 3],
            target_tree: vec![1, 2, 4],
        },
        bst::Instance {
            values: vec![1, 2, 2],
            target_tree: vec![1, 2, 2],
        },
    ];
    for inst in &cases {
        assert!(collect_exhaustive(&bst::BstForcedOrder, inst).is_empty());
        assert!(bst::BstForcedOrder.shortcuts(inst).is_empty());
        assert_eq!(bst::BstForcedOrder.random_input(inst, 7), None);
        assert_eq!(
            bst::BstForcedOrder.random_neighbor(inst, &inst.values, 7),
            None
        );
    }

    let empty = bst::Instance {
        values: vec![],
        target_tree: vec![],
    };
    assert_eq!(
        collect_exhaustive(&bst::BstForcedOrder, &empty),
        vec![Vec::<i32>::new()]
    );
    assert_eq!(bst::BstForcedOrder.random_input(&empty, 7), Some(vec![]));

    let valid = bst::Instance {
        values: vec![1, 2, 3],
        target_tree: vec![2, 1, 3],
    };
    assert_eq!(
        bst::BstForcedOrder.random_neighbor(&valid, &vec![1, 2, 3], 7),
        None
    );
}

#[test]
fn list_incremental_space_exposes_invalid_prefixes_and_neighbors() {
    let inst = DriftInstance {
        start: vec![8, 3],
        target: vec![3],
    };
    let SearchSpace::Incremental {
        state_key, extend, ..
    } = Drift.search_space(&inst)
    else {
        panic!("expected Incremental search space");
    };
    let empty_list_ops = vec![
        Operation::Delete { index: 0 },
        Operation::Delete { index: 0 },
    ];
    let invalid_ops = vec![Operation::Delete { index: 9 }];

    assert!(state_key(&empty_list_ops).is_some());
    assert_eq!(state_key(&invalid_ops), None);
    assert!(extend(&invalid_ops).is_empty());
    assert_eq!(Drift.random_neighbor(&inst, &invalid_ops, 7), None);
}
