//! Linear-probing hash table with tombstones, run one operation at a time.
//!
//! # Algorithm
//!
//! [`run`] takes the table's current slots and one [`HashOp`], and returns the
//! updated slots and the [`HashStep`] log. Keys hash to
//! `key.rem_euclid(capacity)`, and every operation probes
//! `start, start + 1, ...` (mod `capacity`) for at most `capacity` slots.
//!
//! - `insert(key)` keeps set semantics. It remembers the first tombstone but
//!   keeps probing until an empty slot, so it never stores `key` twice. It
//!   places `key` in that first tombstone if one was seen, otherwise in the
//!   empty slot.
//! - `search(key)` steps past other keys and tombstones, and stops on `key` or
//!   an empty slot.
//! - `delete(key)` searches, then marks a found slot as a tombstone.
//!
//! # Step log
//!
//! Every log starts with [`HashStep::ComputeHash`], has one
//! [`HashStep::Probe`] per inspected slot, and ends with exactly one terminal
//! step. Steps describe only what the algorithm did; callers map them to code
//! lines.

use serde::{Deserialize, Serialize};

/// The table size the visualiser uses.
pub const DEFAULT_CAPACITY: usize = 11;

/// The state of one bucket.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum HashSlot {
    /// Never held a key since the table was cleared.
    Empty,
    /// Holds `key`.
    Occupied { key: i32 },
    /// Held a key that was deleted.
    Tombstone,
}

/// One operation to run on the table.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum HashOp {
    /// Add `key` unless it is already stored.
    Insert { key: i32 },
    /// Look for `key` without changing the table.
    Search { key: i32 },
    /// Replace `key`'s slot with a tombstone, if `key` is stored.
    Delete { key: i32 },
}

/// One recorded event while an operation runs.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum HashStep {
    /// `key` hashed to `index` in a table of `capacity` slots.
    ComputeHash {
        key: i32,
        capacity: usize,
        index: usize,
    },
    /// The probe numbered `probe_number` (from 1) inspected `slot` at `index`.
    ///
    /// During an insert, `first_tombstone` is the first tombstone index seen
    /// so far, including this slot. It is always `None` for search and
    /// delete.
    Probe {
        index: usize,
        slot: HashSlot,
        probe_number: u32,
        first_tombstone: Option<usize>,
    },
    /// `key` was stored at `index`, over a tombstone if `replaced_tombstone`.
    Place {
        key: i32,
        index: usize,
        replaced_tombstone: bool,
    },
    /// An insert found `key` already stored at `index`.
    AlreadyPresent { key: i32, index: usize },
    /// A search found `key` at `index`.
    Found { key: i32, index: usize },
    /// A search or delete did not find `key`.
    NotFound { key: i32 },
    /// A delete replaced `key` at `index` with a tombstone.
    MarkTombstone { key: i32, index: usize },
    /// An insert found no empty slot or tombstone for `key`.
    TableFull { key: i32 },
}

/// The table and step log after one operation.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HashRunResult {
    /// The slots after the operation.
    pub slots: Vec<HashSlot>,
    /// Everything the operation did, in order.
    pub steps: Vec<HashStep>,
    /// How many [`HashStep::Probe`] steps `steps` holds.
    pub probes: u32,
}

/// Runs `op` on a table of `capacity` buckets holding `slots`.
///
/// Returns an error when `capacity` is 0 or `slots.len()` differs from
/// `capacity`.
pub fn run(capacity: usize, slots: &[HashSlot], op: HashOp) -> Result<HashRunResult, String> {
    if capacity == 0 {
        return Err("capacity must be at least 1".to_string());
    }
    if slots.len() != capacity {
        return Err(format!(
            "capacity is {capacity} but {} slots were given",
            slots.len()
        ));
    }

    let mut table = Table {
        slots: slots.to_vec(),
        steps: Vec::new(),
        probes: 0,
    };
    match op {
        HashOp::Insert { key } => table.insert(key),
        HashOp::Search { key } => {
            let step = match table.find(key) {
                Some(index) => HashStep::Found { key, index },
                None => HashStep::NotFound { key },
            };
            table.steps.push(step);
        }
        HashOp::Delete { key } => {
            let step = match table.find(key) {
                Some(index) => {
                    table.slots[index] = HashSlot::Tombstone;
                    HashStep::MarkTombstone { key, index }
                }
                None => HashStep::NotFound { key },
            };
            table.steps.push(step);
        }
    }
    Ok(HashRunResult {
        slots: table.slots,
        steps: table.steps,
        probes: table.probes,
    })
}

struct Table {
    slots: Vec<HashSlot>,
    steps: Vec<HashStep>,
    probes: u32,
}

impl Table {
    /// Logs the hash of `key` and returns the probe order from it.
    fn probe_order(&mut self, key: i32) -> impl Iterator<Item = usize> + use<> {
        let capacity = self.slots.len();
        let start = i128::from(key).rem_euclid(capacity as i128) as usize;
        self.steps.push(HashStep::ComputeHash {
            key,
            capacity,
            index: start,
        });
        (0..capacity).map(move |offset| (start + offset) % capacity)
    }

    fn probe(&mut self, index: usize, first_tombstone: Option<usize>) -> HashSlot {
        self.probes += 1;
        let slot = self.slots[index];
        self.steps.push(HashStep::Probe {
            index,
            slot,
            probe_number: self.probes,
            first_tombstone,
        });
        slot
    }

    /// Probes for `key` until it or an empty slot turns up.
    fn find(&mut self, key: i32) -> Option<usize> {
        for index in self.probe_order(key) {
            match self.probe(index, None) {
                HashSlot::Occupied { key: stored } if stored == key => return Some(index),
                HashSlot::Empty => return None,
                _ => {}
            }
        }
        None
    }

    fn insert(&mut self, key: i32) {
        let mut first_tombstone = None;
        let mut empty = None;
        for index in self.probe_order(key) {
            let slot = self.slots[index];
            if slot == HashSlot::Tombstone && first_tombstone.is_none() {
                first_tombstone = Some(index);
            }
            self.probe(index, first_tombstone);
            match slot {
                HashSlot::Occupied { key: stored } if stored == key => {
                    self.steps.push(HashStep::AlreadyPresent { key, index });
                    return;
                }
                HashSlot::Empty => {
                    empty = Some(index);
                    break;
                }
                _ => {}
            }
        }
        let step = match first_tombstone.or(empty) {
            Some(index) => {
                self.slots[index] = HashSlot::Occupied { key };
                HashStep::Place {
                    key,
                    index,
                    replaced_tombstone: first_tombstone.is_some(),
                }
            }
            None => HashStep::TableFull { key },
        };
        self.steps.push(step);
    }
}
