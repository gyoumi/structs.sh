//! Calls `structs.line` at the start of each statement.

use std::collections::{BTreeMap, HashMap};

use walrus::ir::{self, Instr, InstrLocId, InstrSeqId};
use walrus::{FunctionId, LocalFunction};

use super::const_i32;

/// Statements that start on a `loop` instruction, by the loop's body. A
/// branch back to a loop goes to the start of its body, not to the `loop`
/// instruction, so their calls go there to run on every pass.
pub(super) fn loop_statements(
    function: &LocalFunction,
    sequences: &[InstrSeqId],
    statements: &BTreeMap<u32, usize>,
) -> HashMap<InstrSeqId, usize> {
    let mut found = HashMap::new();
    for &seq in sequences {
        for (instr, loc) in &function.block(seq).instrs {
            if let (Instr::Loop(body), Some(&statement)) = (instr, statements.get(&loc.data())) {
                found.insert(body.seq, statement);
            }
        }
    }
    found
}

/// Calls `line` before each instruction that starts a statement, and first
/// thing in a loop body whose statement starts on its `loop` instruction.
pub(super) fn add_line_calls(
    function: &mut LocalFunction,
    seq: InstrSeqId,
    statements: &BTreeMap<u32, usize>,
    loop_start: Option<usize>,
    frame_base: &Instr,
    line: FunctionId,
) {
    let call_line = |statement: usize| {
        [
            (const_i32(statement as i32), InstrLocId::default()),
            (frame_base.clone(), InstrLocId::default()),
            (Instr::Call(ir::Call { func: line }), InstrLocId::default()),
        ]
    };
    let instrs = std::mem::take(&mut function.block_mut(seq).instrs);
    let mut rewritten = Vec::with_capacity(instrs.len());
    if let Some(statement) = loop_start {
        rewritten.extend(call_line(statement));
    }
    for (instr, loc) in instrs {
        if let Some(&statement) = statements.get(&loc.data())
            && !matches!(instr, Instr::Loop(_))
        {
            rewritten.extend(call_line(statement));
        }
        rewritten.push((instr, loc));
    }
    function.block_mut(seq).instrs = rewritten;
}
