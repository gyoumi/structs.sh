//! Helpers shared by the `heap_*.rs` tests of `daily_challenges::heap`, which follow
//! docs/heap.md ("1a. Rust heap module" and its "Exact step order").
//!
//! Expected step logs are written in the short notation in [`LEGEND`], so a failing test prints
//! the expected and the actual log one step per line. Each test file uses only some helpers.
#![allow(dead_code)]

use std::str::FromStr;

use daily_challenges::heap::{HeapOp, HeapOrder, HeapRunResult, HeapStep, run};

pub const LEGEND: &str = "notation: Append K@I = Append { key: K, index: I }; \
    CompareParent I^P swap|stay = CompareParent { index: I, parent: P, swap: true|false }; \
    Swap P<>C = Swap { parent: P, child: C }; TakeRoot K; MoveLastToRoot K from F; \
    CompareChildren I [L R] best B swap|stay = CompareChildren { index: I, left: L, \
    right: Some(R), or None when R is -, best: B, swap: true|false }; Settled K@I; \
    Reinserted K@I; PoppedLast K; Empty; HeapFull K; StartRebuild min|max; Rebuilt min|max. \
    Arrays list items from index 0.";

pub fn both() -> [HeapOrder; 2] {
    [HeapOrder::Min, HeapOrder::Max]
}

pub fn other(order: &HeapOrder) -> HeapOrder {
    match order {
        HeapOrder::Min => HeapOrder::Max,
        HeapOrder::Max => HeapOrder::Min,
    }
}

pub fn name(order: &HeapOrder) -> &'static str {
    match order {
        HeapOrder::Min => "Min",
        HeapOrder::Max => "Max",
    }
}

fn wire(order: &HeapOrder) -> &'static str {
    match order {
        HeapOrder::Min => "min",
        HeapOrder::Max => "max",
    }
}

/// Strictly smaller for a min-heap, strictly greater for a max-heap.
pub fn better(order: &HeapOrder, a: i32, b: i32) -> bool {
    match order {
        HeapOrder::Min => a < b,
        HeapOrder::Max => a > b,
    }
}

/// The smallest index whose key is better than its parent's, if any.
pub fn violation(order: &HeapOrder, items: &[i32]) -> Option<usize> {
    (1..items.len()).find(|&i| better(order, items[i], items[(i - 1) / 2]))
}

pub fn sorted(items: &[i32]) -> Vec<i32> {
    let mut items = items.to_vec();
    items.sort_unstable();
    items
}

pub fn insert(key: i32) -> HeapOp {
    HeapOp::Insert { key }
}

pub fn op_text(op: &HeapOp) -> String {
    match op {
        HeapOp::Insert { key } => format!("Insert {{ key: {key} }}"),
        HeapOp::Pop => "Pop".to_owned(),
        HeapOp::Rebuild => "Rebuild".to_owned(),
    }
}

fn num<T: FromStr>(text: &str, within: &str) -> T {
    let parsed = text.parse();
    parsed.unwrap_or_else(|_| panic!("test bug: bad number {text:?} in {within:?}"))
}

fn parse_op(text: &str) -> HeapOp {
    match text.split_whitespace().collect::<Vec<_>>()[..] {
        ["Insert", key] => insert(num(key, text)),
        ["Pop"] => HeapOp::Pop,
        ["Rebuild"] => HeapOp::Rebuild,
        _ => panic!("test bug: bad op {text:?}"),
    }
}

/// Parses an array written as `[9 5 7]`.
pub fn keys(spec: &str) -> Vec<i32> {
    let inner = spec.trim().trim_start_matches('[').trim_end_matches(']');
    inner.split_whitespace().map(|k| num(k, spec)).collect()
}

/// The call as text, e.g. `run(Max, 15, [9, 5, 7], Insert { key: 8 })`.
pub fn call(order: &HeapOrder, cap: usize, items: &[i32], op: &HeapOp) -> String {
    format!("run({}, {cap}, {items:?}, {})", name(order), op_text(op))
}

pub fn describe(step: &HeapStep) -> String {
    let yes = |swap: &bool| if *swap { "swap" } else { "stay" };
    match step {
        HeapStep::Append { key, index } => format!("Append {key}@{index}"),
        HeapStep::CompareParent {
            index,
            parent,
            swap,
        } => format!("CompareParent {index}^{parent} {}", yes(swap)),
        HeapStep::TakeRoot { key } => format!("TakeRoot {key}"),
        HeapStep::MoveLastToRoot { key, from } => format!("MoveLastToRoot {key} from {from}"),
        HeapStep::CompareChildren {
            index,
            left,
            right,
            best,
            swap,
        } => {
            let right = right.map_or("-".to_owned(), |r| r.to_string());
            format!(
                "CompareChildren {index} [{left} {right}] best {best} {}",
                yes(swap)
            )
        }
        HeapStep::Swap { parent, child } => format!("Swap {parent}<>{child}"),
        HeapStep::StartRebuild { order } => format!("StartRebuild {}", wire(order)),
        HeapStep::Reinserted { key, index } => format!("Reinserted {key}@{index}"),
        HeapStep::Settled { key, index } => format!("Settled {key}@{index}"),
        HeapStep::PoppedLast { key } => format!("PoppedLast {key}"),
        HeapStep::Empty => "Empty".to_owned(),
        HeapStep::HeapFull { key } => format!("HeapFull {key}"),
        HeapStep::Rebuilt { order } => format!("Rebuilt {}", wire(order)),
    }
}

fn parse_step(text: &str) -> HeapStep {
    let words: Vec<&str> = text.split_whitespace().collect();
    let split = |word: &str, sep: &str| -> (i64, usize) {
        let (a, b) = word
            .split_once(sep)
            .unwrap_or_else(|| panic!("test bug: {text:?}"));
        (num(a, text), num(b, text))
    };
    let swap = |word: &str| match word {
        "swap" => true,
        "stay" => false,
        _ => panic!("test bug: swap or stay in {text:?}"),
    };
    let order = |word: &str| match word {
        "min" => HeapOrder::Min,
        "max" => HeapOrder::Max,
        _ => panic!("test bug: min or max in {text:?}"),
    };
    let key = |word: &str| -> i32 { num(word, text) };
    let index = |word: &str| -> usize { num(word, text) };
    let at = |word: &str| {
        let (k, i) = split(word, "@");
        (i32::try_from(k).expect("key fits i32"), i)
    };
    match words[..] {
        ["Append", w] => {
            let (key, index) = at(w);
            HeapStep::Append { key, index }
        }
        ["CompareParent", w, s] => {
            let (index, parent) = split(w, "^");
            let index = usize::try_from(index).expect("index");
            HeapStep::CompareParent {
                index,
                parent,
                swap: swap(s),
            }
        }
        ["Swap", w] => {
            let (parent, child) = split(w, "<>");
            let parent = usize::try_from(parent).expect("index");
            HeapStep::Swap { parent, child }
        }
        ["TakeRoot", k] => HeapStep::TakeRoot { key: key(k) },
        ["MoveLastToRoot", k, "from", f] => HeapStep::MoveLastToRoot {
            key: key(k),
            from: index(f),
        },
        ["CompareChildren", i, l, r, "best", b, s] => HeapStep::CompareChildren {
            index: index(i),
            left: index(l.trim_start_matches('[')),
            right: match r.trim_end_matches(']') {
                "-" => None,
                r => Some(index(r)),
            },
            best: index(b),
            swap: swap(s),
        },
        ["StartRebuild", o] => HeapStep::StartRebuild { order: order(o) },
        ["Reinserted", w] => {
            let (key, index) = at(w);
            HeapStep::Reinserted { key, index }
        }
        ["Settled", w] => {
            let (key, index) = at(w);
            HeapStep::Settled { key, index }
        }
        ["PoppedLast", k] => HeapStep::PoppedLast { key: key(k) },
        ["Empty"] => HeapStep::Empty,
        ["HeapFull", k] => HeapStep::HeapFull { key: key(k) },
        ["Rebuilt", o] => HeapStep::Rebuilt { order: order(o) },
        _ => panic!("test bug: bad step {text:?}"),
    }
}

/// Parses a log written as `Append 8@3; CompareParent 3^1 swap; ...`.
pub fn steps(spec: &str) -> Vec<HeapStep> {
    let spec = spec.trim();
    if spec.is_empty() {
        return Vec::new();
    }
    spec.split(';').map(parse_step).collect()
}

pub fn show_log(steps: &[HeapStep]) -> String {
    if steps.is_empty() {
        return "  (no steps)".to_owned();
    }
    let lines: Vec<String> = steps
        .iter()
        .enumerate()
        .map(|(n, step)| format!("  {n}: {}", describe(step)))
        .collect();
    lines.join("\n")
}

pub fn assert_log(ctx: &str, what: &str, got: &[HeapStep], want: &[HeapStep]) {
    if got == want {
        return;
    }
    let first = got.iter().zip(want).position(|(g, w)| g != w);
    let first = first.unwrap_or(got.len().min(want.len()));
    panic!(
        "{ctx}: {what}: the step log differs from step {first} on\nexpected:\n{}\ngot:\n{}\n{LEGEND}",
        show_log(want),
        show_log(got)
    );
}

/// The same step for the other order with every key negated.
pub fn mirror_step(step: &HeapStep) -> HeapStep {
    use HeapStep as S;
    let mut step = step.clone();
    match &mut step {
        S::Append { key, .. }
        | S::TakeRoot { key }
        | S::MoveLastToRoot { key, .. }
        | S::Reinserted { key, .. }
        | S::Settled { key, .. }
        | S::PoppedLast { key }
        | S::HeapFull { key } => *key = -*key,
        S::StartRebuild { order } | S::Rebuilt { order } => *order = other(order),
        S::CompareParent { .. } | S::CompareChildren { .. } | S::Swap { .. } | S::Empty => {}
    }
    step
}

pub fn negated(items: &[i32]) -> Vec<i32> {
    items.iter().map(|k| -k).collect()
}

fn mirror_op(op: &HeapOp) -> HeapOp {
    match op {
        HeapOp::Insert { key } => insert(-key),
        other => other.clone(),
    }
}

/// Runs a call that should succeed; returns the call as text and the result.
pub fn run_ok(
    order: &HeapOrder,
    cap: usize,
    items: &[i32],
    op: &HeapOp,
) -> (String, HeapRunResult) {
    let ctx = call(order, cap, items, op);
    match run(order.clone(), cap, items, op.clone()) {
        Ok(result) => (ctx, result),
        Err(message) => panic!("{ctx}: expected Ok, got Err({message:?})"),
    }
}

/// Runs a call that should be rejected; returns the call as text and the error.
pub fn run_err(order: &HeapOrder, cap: usize, items: &[i32], op: &HeapOp) -> (String, String) {
    let ctx = call(order, cap, items, op);
    match run(order.clone(), cap, items, op.clone()) {
        Ok(r) => panic!(
            "{ctx}: expected Err, got Ok with items {:?} and log\n{}\n{LEGEND}",
            r.items,
            show_log(&r.steps)
        ),
        Err(message) => (ctx, message),
    }
}

pub use crate::common::heap_check::invariants;

struct Case {
    why: String,
    order: HeapOrder,
    cap: usize,
    before: Vec<i32>,
    op: HeapOp,
    steps: Vec<HeapStep>,
    after: Vec<i32>,
}

impl Case {
    fn parse(order: &HeapOrder, cap: usize, case: &str) -> Self {
        let fields: Vec<&str> = case.split('|').map(str::trim).collect();
        let [why, op, before, log, after] = fields[..] else {
            panic!("test bug: bad case {case:?}")
        };
        Case {
            why: why.to_owned(),
            order: order.clone(),
            cap,
            before: keys(before),
            op: parse_op(op),
            steps: steps(log),
            after: keys(after),
        }
    }

    fn mirrored(&self) -> Self {
        let why = format!(
            "mirror of the {} case \"{}\" (other order, every key negated)",
            name(&self.order),
            self.why
        );
        Case {
            why,
            order: other(&self.order),
            cap: self.cap,
            before: negated(&self.before),
            op: mirror_op(&self.op),
            steps: self.steps.iter().map(mirror_step).collect(),
            after: negated(&self.after),
        }
    }

    fn verify(&self) {
        let ctx = call(&self.order, self.cap, &self.before, &self.op);
        let ctx = format!("{ctx} [{}]", self.why);
        let result = run(self.order.clone(), self.cap, &self.before, self.op.clone());
        let result = result.unwrap_or_else(|e| panic!("{ctx}: expected Ok, got Err({e:?})"));
        assert_log(&ctx, "exact step log", &result.steps, &self.steps);
        let (got, want) = (&result.items, &self.after);
        assert_eq!(
            got, want,
            "{ctx}: items after the run: expected {want:?}, got {got:?}"
        );
        invariants(&ctx, &self.order, self.cap, &self.before, &self.op, &result);
    }
}

/// Runs each case `"why | op | items before | step log | items after"` in `order` with capacity
/// `cap`, then again mirrored: in the other order with every key negated, which must give the
/// mirror-image log and items.
pub fn cases(order: &HeapOrder, cap: usize, list: &[&str]) {
    for case in list {
        let case = Case::parse(order, cap, case);
        case.verify();
        case.mirrored().verify();
    }
}

/// Like [`cases`] without the mirrored run, for keys such as `i32::MIN` that can't be negated.
pub fn cases_unmirrored(order: &HeapOrder, cap: usize, list: &[&str]) {
    for case in list {
        Case::parse(order, cap, case).verify();
    }
}
