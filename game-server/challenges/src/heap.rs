//! Binary min-heap or max-heap in a 0-indexed array, run one operation at a
//! time.
//!
//! # Algorithm
//!
//! [`run`] takes the heap's current array, its [`HeapOrder`] and one
//! [`HeapOp`], and returns the updated array and the [`HeapStep`] log. The
//! children of `i` are `2i + 1` and `2i + 2`, and its parent is `(i - 1) / 2`.
//! A key is *better* than another when it is strictly smaller in a min-heap
//! or strictly greater in a max-heap, so equal keys never swap.
//!
//! - `insert(key)` appends `key` and sifts it up while it is better than its
//!   parent. Inserting into a full heap changes nothing.
//! - `pop` removes the root, moves the last key to the root and sifts it down
//!   while its better child (the left on a tie) is better than it.
//! - `rebuild` takes a heap of the other order, empties it, and inserts its
//!   keys again in array order under the new order.
//!
//! # Step log
//!
//! Every log ends with exactly one terminal step: [`HeapStep::Settled`],
//! [`HeapStep::PoppedLast`], [`HeapStep::Empty`], [`HeapStep::HeapFull`] or
//! [`HeapStep::Rebuilt`]. Steps describe only what the algorithm did; callers
//! map them to code lines.

use serde::{Deserialize, Serialize};

/// The heap size the visualiser uses: four full levels.
pub const DEFAULT_CAPACITY: usize = 15;

/// Which key sits at the root.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum HeapOrder {
    /// The smallest key is at the root.
    Min,
    /// The largest key is at the root.
    Max,
}

impl HeapOrder {
    /// Whether `a` is strictly better than `b` under this order.
    fn better(&self, a: i32, b: i32) -> bool {
        match self {
            Self::Min => a < b,
            Self::Max => a > b,
        }
    }
}

/// One operation to run on the heap.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum HeapOp {
    /// Add `key`.
    Insert { key: i32 },
    /// Remove the root.
    Pop,
    /// Rebuild a heap of the other order in the requested order.
    Rebuild,
}

/// One recorded event while an operation runs.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum HeapStep {
    /// An insert put `key` at the end of the array, at `index`.
    Append { key: i32, index: usize },
    /// One sift-up comparison of the key at `index` with its `parent`.
    /// `swap` is true when the key at `index` is better.
    CompareParent {
        index: usize,
        parent: usize,
        swap: bool,
    },
    /// A pop removed the root, `key`.
    TakeRoot { key: i32 },
    /// A pop moved the last key, `key`, from index `from` to the root.
    MoveLastToRoot { key: i32, from: usize },
    /// One sift-down comparison of the key at `index` with its children.
    ///
    /// `best` is the better child (`left` on a tie), and `swap` is true when
    /// it is better than the key at `index`.
    CompareChildren {
        index: usize,
        left: usize,
        #[serde(deserialize_with = "Option::deserialize")]
        right: Option<usize>,
        best: usize,
        swap: bool,
    },
    /// The keys at `parent` and `child` traded places.
    Swap { parent: usize, child: usize },
    /// A rebuild emptied the heap to refill it in `order`.
    StartRebuild { order: HeapOrder },
    /// A rebuild's re-inserted `key` stopped at `index`.
    Reinserted { key: i32, index: usize },
    /// The inserted key, or the key moved to the root, stopped at `index`.
    Settled { key: i32, index: usize },
    /// A pop removed `key`, the only key, leaving the heap empty.
    PoppedLast { key: i32 },
    /// A pop found the heap empty.
    Empty,
    /// An insert found no room for `key`.
    HeapFull { key: i32 },
    /// A rebuild finished, leaving a heap of `order`.
    Rebuilt { order: HeapOrder },
}

/// The heap and step log after one operation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeapRunResult {
    /// The array after the operation.
    pub items: Vec<i32>,
    /// Everything the operation did, in order.
    pub steps: Vec<HeapStep>,
    /// How many [`HeapStep::CompareParent`] and [`HeapStep::CompareChildren`]
    /// steps `steps` holds.
    pub comparisons: u32,
    /// How many [`HeapStep::Swap`] steps `steps` holds.
    pub swaps: u32,
    /// The removed root after a successful pop, otherwise `None`.
    pub popped: Option<i32>,
}

/// Runs `op` on a heap of `order` with room for `capacity` keys, holding
/// `items`.
///
/// Returns an error, checked in this order, when `capacity` is 0, when
/// `items` holds more than `capacity` keys, or when `items` isn't a heap of
/// `order` (of the other order for [`HeapOp::Rebuild`]). The last names the
/// first index whose key is better than its parent's, and that parent.
pub fn run(
    order: HeapOrder,
    capacity: usize,
    items: &[i32],
    op: HeapOp,
) -> Result<HeapRunResult, String> {
    if capacity == 0 {
        return Err("capacity must be at least 1".to_string());
    }
    if items.len() > capacity {
        return Err(format!(
            "{} items were given but the capacity is {capacity}",
            items.len()
        ));
    }
    let input_order = match (&op, &order) {
        (HeapOp::Rebuild, HeapOrder::Min) => HeapOrder::Max,
        (HeapOp::Rebuild, HeapOrder::Max) => HeapOrder::Min,
        _ => order.clone(),
    };
    let violation =
        (1..items.len()).find(|&index| input_order.better(items[index], items[(index - 1) / 2]));
    if let Some(index) = violation {
        return Err(format!(
            "items are not a {input_order:?} heap: index {index} is better than its parent at index {}",
            (index - 1) / 2
        ));
    }

    let mut result = HeapRunResult {
        items: items.to_vec(),
        steps: Vec::new(),
        comparisons: 0,
        swaps: 0,
        popped: None,
    };
    match op {
        HeapOp::Insert { key } => result.insert(&order, capacity, key),
        HeapOp::Pop => result.pop(&order),
        HeapOp::Rebuild => result.rebuild(order),
    }
    Ok(result)
}

impl HeapRunResult {
    fn swap(&mut self, parent: usize, child: usize) {
        self.items.swap(parent, child);
        self.swaps += 1;
        self.steps.push(HeapStep::Swap { parent, child });
    }

    /// Appends `key`, sifts it up and returns its final index.
    fn push(&mut self, order: &HeapOrder, key: i32) -> usize {
        let mut index = self.items.len();
        self.items.push(key);
        self.steps.push(HeapStep::Append { key, index });
        while index > 0 {
            let parent = (index - 1) / 2;
            let swap = order.better(self.items[index], self.items[parent]);
            self.comparisons += 1;
            self.steps.push(HeapStep::CompareParent {
                index,
                parent,
                swap,
            });
            if !swap {
                break;
            }
            self.swap(parent, index);
            index = parent;
        }
        index
    }

    /// Sifts the key at `index` down and returns its final index.
    fn sift_down(&mut self, order: &HeapOrder, mut index: usize) -> usize {
        let len = self.items.len();
        while 2 * index + 1 < len {
            let left = 2 * index + 1;
            let right = Some(left + 1).filter(|&right| right < len);
            let best = match right {
                Some(right) if order.better(self.items[right], self.items[left]) => right,
                _ => left,
            };
            let swap = order.better(self.items[best], self.items[index]);
            self.comparisons += 1;
            self.steps.push(HeapStep::CompareChildren {
                index,
                left,
                right,
                best,
                swap,
            });
            if !swap {
                break;
            }
            self.swap(index, best);
            index = best;
        }
        index
    }

    fn insert(&mut self, order: &HeapOrder, capacity: usize, key: i32) {
        if self.items.len() == capacity {
            self.steps.push(HeapStep::HeapFull { key });
            return;
        }
        let index = self.push(order, key);
        self.steps.push(HeapStep::Settled { key, index });
    }

    fn pop(&mut self, order: &HeapOrder) {
        let Some(&root) = self.items.first() else {
            self.steps.push(HeapStep::Empty);
            return;
        };
        self.popped = Some(root);
        self.steps.push(HeapStep::TakeRoot { key: root });
        let Some(last) = self.items.pop().filter(|_| !self.items.is_empty()) else {
            self.steps.push(HeapStep::PoppedLast { key: root });
            return;
        };
        self.items[0] = last;
        self.steps.push(HeapStep::MoveLastToRoot {
            key: last,
            from: self.items.len(),
        });
        let index = self.sift_down(order, 0);
        self.steps.push(HeapStep::Settled { key: last, index });
    }

    fn rebuild(&mut self, order: HeapOrder) {
        let old = std::mem::take(&mut self.items);
        self.steps.push(HeapStep::StartRebuild {
            order: order.clone(),
        });
        for key in old {
            let index = self.push(&order, key);
            self.steps.push(HeapStep::Reinserted { key, index });
        }
        self.steps.push(HeapStep::Rebuilt { order });
    }
}
