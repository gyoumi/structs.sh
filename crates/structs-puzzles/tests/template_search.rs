use std::collections::{BinaryHeap, HashMap, HashSet};
use std::{cmp::Reverse, fmt::Debug};

use structs_puzzles::linked_list_index_drift::{self as drift, LinkedListIndexDrift as Drift};
use structs_puzzles::{
    SearchSpace, Shortcut, Template, avl_rotations as avl, bst_forced_order as bst, bubble,
    insertion_beats_merge as ibm, linked_list_index_drift::Operation, quicksort as qs,
    upset_bst_beats_avl as upset,
};

// Spec: Step 2b-1 plan (launch shapes, shortcut names). DRIFT_26 matches `e2e/support/daily-list-
// fixtures.ts`; its optimum is cost 5 (delete(0) walks 1, insert(5, 2) walks 2, plus 2 operations).

const SEEDS: [u64; 8] = [0, 1, 2, 3, 42, 2026, 99_999, u64::MAX];

/// One instance per seed, with its context, checking `generate` is deterministic and varied.
fn generated<T: Template>(t: &T, name: &str) -> Vec<(String, T::Instance)>
where
    T::Instance: PartialEq + Debug,
{
    let all: Vec<(u64, T::Instance)> = SEEDS.iter().map(|&s| (s, t.generate(s))).collect();
    for (seed, inst) in &all {
        let m = format!("{name}.generate({seed}) twice should give equal instances");
        assert_eq!(&t.generate(*seed), inst, "{m}");
    }
    let keys: HashSet<String> = all.iter().map(|x| format!("{:?}", x.1)).collect();
    let m = format!("{name}.generate over seeds {SEEDS:?} should vary: got {all:?}");
    assert!(keys.len() >= 6, "{m}");
    let ctx = |(s, i): (u64, T::Instance)| (format!("{name}.generate({s}) = {i:?}"), i);
    all.into_iter().map(ctx).collect()
}

fn assert_permutation(ctx: &str, values: &[i32], n: i32) {
    let mut sorted = values.to_vec();
    sorted.sort_unstable();
    let m = format!("{ctx}: values should be a permutation of 1..={n}");
    assert_eq!(sorted, (1..=n).collect::<Vec<_>>(), "{m}");
}

/// Checks a fixed-slot template's generated `values` and `fixed` against the launch shape.
macro_rules! shape {
    ($m:ident::$t:ident, $n:literal, $count:literal $(, $extra:expr, $why:expr)?) => {
        for (ctx, i) in generated(&$m::$t, stringify!($t)) {
            assert_permutation(&ctx, &i.values, $n);
            let ok = i.fixed.windows(2).all(|w| w[0] < w[1]) && i.fixed.iter().all(|&f| f < $n);
            let m = format!("{ctx}: want {} ascending fixed slots in 0..{}", $count, $n);
            assert!(ok && i.fixed.len() == $count, "{m}");
            $(assert!(($extra)(&i), "{ctx}: {}", $why);)?
        }
    };
}

#[test]
fn generate_is_deterministic_varied_and_matches_the_launch_shape() {
    shape!(qs::Quicksort, 9, 3);
    let passes = |i: &bubble::Instance| (3..=6).contains(&i.target_passes);
    let why = "target_passes should be in 3..=6";
    shape!(bubble::Bubble, 8, 3, passes, why);
    shape!(ibm::InsertionBeatsMerge, 9, 3);
    shape!(avl::AvlRotations, 9, 3);
    shape!(upset::UpsetBstBeatsAvl, 14, 6);
    for (ctx, i) in generated(&bst::BstForcedOrder, "BstForcedOrder") {
        assert_permutation(&ctx, &i.values, 10);
        let m = format!("{ctx}: target_tree should hold 10 keys");
        assert_eq!(i.target_tree.len(), 10, "{m}");
        let got = bst::BstForcedOrder.solved_score(&i, &i.target_tree);
        let m = format!("{ctx}: inserting target_tree (a preorder) should solve: {got:?}");
        assert!(matches!(got, Ok(Some(_))), "{m}");
    }
    for (ctx, i) in generated(&Drift, "LinkedListIndexDrift") {
        let distinct = i.start.iter().collect::<HashSet<_>>().len();
        let in_range = i.start.iter().chain(&i.target).all(|v| (1..=7).contains(v));
        let ok = distinct == 6 && i.start.len() == 6 && in_range && !i.target.is_empty();
        let m = format!("{ctx}: want 6 distinct start values, a non-empty target, all in 1..=7");
        assert!(ok, "{m}");
        assert_ne!(i.start, i.target, "{ctx}: target should differ from start");
    }
}

/// Checks `shortcuts`, `random_input` and `random_neighbor` on one instance. `solve` says whether
/// random inputs and neighbors must solve; `keeps` whether an input leaves every fixed slot alone.
fn check_moves<T, K>(t: &T, ctx: &str, i: &T::Instance, names: &[&str], solve: [bool; 2], keeps: K)
where
    T: Template<Input: PartialEq + Debug>,
    K: Fn(&T::Input) -> bool,
{
    let cuts: Vec<Shortcut<T::Input>> = t.shortcuts(i);
    let got: Vec<&str> = cuts.iter().map(|c| c.name).collect();
    let m = format!("{ctx}: shortcuts {got:?} should include all of {names:?}");
    assert!(names.iter().all(|n| got.contains(n)), "{m}");
    for Shortcut { name, input } in &cuts {
        let (run, got) = (t.run(i, input).err(), t.solved_score(i, input));
        let m = format!("{ctx}: shortcut {name:?} = {input:?}: run {run:?}, solved_score {got:?}");
        assert!(run.is_none() && got.is_ok(), "{m}");
    }
    let mut moved = false;
    for seed in SEEDS {
        let input = t
            .random_input(i, seed)
            .expect("valid instance should sample");
        let next = t
            .random_neighbor(i, &input, seed)
            .expect("valid input should neighbor");
        let c = format!("{ctx}: seed {seed}: random_input {input:?}, random_neighbor {next:?}");
        let same = t.random_input(i, seed).as_ref() == Some(&input)
            && t.random_neighbor(i, &input, seed).as_ref() == Some(&next);
        assert!(same, "{c}: a second call with this seed differed");
        for (x, must_solve) in [(&input, solve[0]), (&next, solve[1])] {
            let got = t.solved_score(i, x);
            let solved = matches!(got, Ok(Some(_))) || (!must_solve && got.is_ok());
            let m = format!("{c}: {x:?} should be valid, keep fixed slots, solve if {must_solve}");
            assert!(solved && keeps(x), "{m}: solved_score gave {got:?}");
        }
        moved |= next != input;
    }
    let m = format!("{ctx}: random_neighbor never changed its input over seeds {SEEDS:?}");
    assert!(moved, "{m}");
}

fn keeps_fixed(values: &[i32], fixed: &[usize], input: &[i32]) -> bool {
    input.len() == values.len() && fixed.iter().all(|&i| input[i] == values[i])
}

macro_rules! moves {
    ($m:ident::$t:ident, $seed:expr, $names:expr) => {{
        let i = $m::$t.generate($seed);
        let ctx = format!("{} on generate({}) = {i:?}", stringify!($t), $seed);
        let keeps = |x: &Vec<i32>| keeps_fixed(&i.values, &i.fixed, x);
        check_moves(&$m::$t, &ctx, &i, $names, [false, false], keeps);
    }};
}

#[test]
fn shortcuts_and_random_moves_are_valid_for_every_template() {
    let cheap = ["cheap-front-rebuild"];
    for seed in [1, 7, 2026] {
        moves!(qs::Quicksort, seed, &["ascending", "descending", "zigzag"]);
        moves!(bubble::Bubble, seed, &["bubble-recipe"]);
        moves!(ibm::InsertionBeatsMerge, seed, &["desc-halves"]);
        moves!(avl::AvlRotations, seed, &[]);
        moves!(upset::UpsetBstBeatsAvl, seed, &[]);
        let i = bst::BstForcedOrder.generate(seed);
        let ctx = format!("BstForcedOrder on generate({seed}) = {i:?}");
        let n = ["preorder", "levelorder", "min-available"];
        check_moves(&bst::BstForcedOrder, &ctx, &i, &n, [true; 2], |_| true);
        let i = Drift.generate(seed);
        let ctx = format!("LinkedListIndexDrift on generate({seed}) = {i:?}");
        check_moves(&Drift, &ctx, &i, &cheap, [true, false], |_| true);
    }
    let ctx = format!("LinkedListIndexDrift on DRIFT_26 = {:?}", drift_26());
    check_moves(&Drift, &ctx, &drift_26(), &cheap, [true, false], |_| true);
}

fn exhaustive<T: Template>(t: &T, ctx: &str, inst: &T::Instance) -> Vec<T::Input> {
    match t.search_space(inst) {
        SearchSpace::Exhaustive(all) => all.take(10_000).collect(),
        SearchSpace::Incremental { .. } => panic!("{ctx}: should be Exhaustive, got Incremental"),
    }
}

/// Values [4, 2, 5, 1, 3] with slots 1 and 3 fixed, leaving (5 - 2)! = 6 orders.
const SMALL: [i32; 5] = [4, 2, 5, 1, 3];
const FIXED: [usize; 2] = [1, 3];

macro_rules! exhaustive_six {
    ($m:ident::$t:ident $(, $field:ident: $value:expr)*) => {{
        let (values, fixed) = (SMALL.to_vec(), FIXED.to_vec());
        let inst = $m::Instance { values, fixed $(, $field: $value)* };
        let ctx = format!("{}.search_space({inst:?})", stringify!($t));
        let all = exhaustive(&$m::$t, &ctx, &inst);
        let distinct = all.iter().collect::<HashSet<_>>().len();
        let m = format!("{ctx}: want exactly 6 distinct orders, got {distinct}: {all:?}");
        assert!(all.len() == 6 && distinct == 6, "{m}");
        for input in &all {
            let got = $m::$t.solved_score(&inst, input);
            let m = format!("{ctx}: yielded {input:?} should be valid and keep slots {FIXED:?}");
            assert!(got.is_ok() && keeps_fixed(&SMALL, &FIXED, input), "{m}: {got:?}");
        }
    }};
}

#[test]
fn exhaustive_search_space_lists_exactly_the_valid_orders_once() {
    exhaustive_six!(qs::Quicksort);
    exhaustive_six!(bubble::Bubble, target_passes: 3);
    exhaustive_six!(ibm::InsertionBeatsMerge);
    exhaustive_six!(avl::AvlRotations);
    exhaustive_six!(upset::UpsetBstBeatsAvl);
    // Target 2(1, 3( , 4)): 2 goes first, 3 before 4, and 1 anywhere after 2.
    let (values, target_tree) = (vec![1, 2, 3, 4], vec![2, 1, 3, 4]);
    let inst = bst::Instance {
        values,
        target_tree,
    };
    let ctx = format!("BstForcedOrder.search_space({inst:?})");
    let mut all = exhaustive(&bst::BstForcedOrder, &ctx, &inst);
    all.sort();
    let m = format!("{ctx}: should yield exactly the 3 orders that build it (sorted here)");
    assert_eq!(all, [[2, 1, 3, 4], [2, 3, 1, 4], [2, 3, 4, 1]], "{m}");
    for input in &all {
        let got = bst::BstForcedOrder.solved_score(&inst, input);
        let m = format!("{ctx}: yielded {input:?} should solve: {got:?}");
        assert!(matches!(got, Ok(Some(_))), "{m}");
    }
}

fn drift_26() -> drift::Instance {
    let (start, target) = (vec![8, 3, 6, 1], vec![3, 6, 5, 1]);
    drift::Instance { start, target }
}

fn del(index: usize) -> Operation {
    Operation::Delete { index }
}

/// Plain Dijkstra from `start`, deduplicating states by `key`; `None` if no goal is reachable.
fn cheapest<I: Clone>(
    start: I,
    key: impl Fn(&I) -> Option<Vec<u8>>,
    extend: impl Fn(&I) -> Vec<(I, u32)>,
    goal: impl Fn(&I) -> bool,
) -> Option<u32> {
    let mut best: HashMap<Vec<u8>, u32> = HashMap::from([(key(&start)?, 0)]);
    let (mut nodes, mut heap) = (vec![start], BinaryHeap::from([Reverse((0_u32, 0_usize))]));
    for _ in 0..200_000 {
        let Reverse((cost, id)) = heap.pop()?;
        let node = nodes[id].clone();
        let node_key = key(&node)?;
        if best.get(&node_key).is_some_and(|&b| b < cost) {
            continue;
        }
        if goal(&node) {
            return Some(cost);
        }
        for (child, step) in extend(&node) {
            let Some(k) = key(&child) else {
                continue;
            };
            let total = cost + step;
            if best.get(&k).is_none_or(|&b| total < b) {
                best.insert(k, total);
                nodes.push(child);
                heap.push(Reverse((total, nodes.len() - 1)));
            }
        }
    }
    panic!("Dijkstra should finish within 200000 pops");
}

#[test]
fn index_drift_incremental_space_is_exact_and_dijkstra_finds_cost_5() {
    let inst = drift_26();
    let ctx = format!("LinkedListIndexDrift.search_space({inst:?})");
    let SearchSpace::Incremental {
        start,
        state_key,
        extend,
    } = Drift.search_space(&inst)
    else {
        panic!("{ctx}: should be Incremental, got Exhaustive");
    };
    let m = format!("{ctx}: start should be no operations, got {start:?}");
    assert!(start.is_empty(), "{m}");
    let cost_of = |ops: &[Operation]| match Drift.evaluate(&inst, ops) {
        Ok(outcome) => outcome.cost,
        Err(e) => panic!("{ctx}: evaluate({ops:?}) should be valid, got {e:?}"),
    };
    // Both of the first pair leave [6, 1]; both of the second leave the start list.
    let ins5 = Operation::Insert { value: 5, index: 0 };
    let same = [
        (vec![del(0), del(0)], vec![del(1), del(0)]),
        (vec![], vec![ins5, del(0)]),
    ];
    for (a, b) in same {
        let m = format!("{ctx}: {a:?} and {b:?} build the same list, so state_key should match");
        assert_eq!(state_key(&a), state_key(&b), "{m}");
    }
    let m = format!("{ctx}: [del(0)] leaves [3, 6, 1] and [del(1)] [8, 6, 1]: keys should differ");
    assert_ne!(state_key(&vec![del(0)]), state_key(&vec![del(1)]), "{m}");
    let mut parents = vec![start.clone()];
    parents.extend(extend(&start).into_iter().map(|(child, _)| child));
    for parent in &parents {
        let children = extend(parent);
        let m = format!("{ctx}: extend({parent:?}) offered no moves");
        assert!(!children.is_empty(), "{m}");
        for (child, step) in children {
            let c = format!("{ctx}: extend({parent:?}) gave {child:?} at cost {step}");
            let grows = child.len() > parent.len() && child.starts_with(parent);
            assert!(grows, "{c}: it should append operations to the parent's");
            let want = cost_of(&child) - cost_of(parent);
            assert_eq!(step, want, "{c}: want evaluate's cost difference {want}");
        }
    }
    let solved = |ops: &Vec<Operation>| matches!(Drift.solved_score(&inst, ops), Ok(Some(_)));
    let got = cheapest(start, &state_key, &extend, solved);
    let m = format!("{ctx}: Dijkstra should find cost 5 (delete(0) then insert(5, 2))");
    assert_eq!(got, Some(5), "{m}");
}
