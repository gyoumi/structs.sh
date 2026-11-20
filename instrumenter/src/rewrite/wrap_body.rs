//! Wraps a function's body so code runs on every way out of it.

use std::collections::HashSet;

use walrus::LocalFunction;
use walrus::ir::{self, Instr, InstrLocId, InstrSeqId, InstrSeqType};

/// Wraps the function's body in a block so that every way out of it, falling
/// off the end, `return`, or a branch to the function's own label, runs
/// `after`, with any results on the stack. `before` runs first.
pub(super) fn wrap_body(
    function: &mut LocalFunction,
    sequences: &[InstrSeqId],
    body_type: InstrSeqType,
    before: Vec<Instr>,
    after: Vec<Instr>,
) {
    let entry = function.entry_block();
    let body = function.builder_mut().dangling_instr_seq(body_type).id();
    function.block_mut(body).instrs = std::mem::take(&mut function.block_mut(entry).instrs);

    let retarget = |target: &mut InstrSeqId| {
        if *target == entry {
            *target = body;
        }
    };
    let moved: HashSet<InstrSeqId> = sequences
        .iter()
        .map(|&seq| if seq == entry { body } else { seq })
        .collect();
    for seq in moved {
        for (instr, _) in function.block_mut(seq).instrs.iter_mut() {
            match instr {
                Instr::Br(branch) => retarget(&mut branch.block),
                Instr::BrIf(branch) => retarget(&mut branch.block),
                Instr::BrTable(table) => {
                    table.blocks.iter_mut().for_each(retarget);
                    retarget(&mut table.default);
                }
                Instr::Return(_) => *instr = Instr::Br(ir::Br { block: body }),
                _ => {}
            }
        }
    }

    function.block_mut(entry).instrs = before
        .into_iter()
        .chain([Instr::Block(ir::Block { seq: body })])
        .chain(after)
        .map(|instr| (instr, InstrLocId::default()))
        .collect();
}
