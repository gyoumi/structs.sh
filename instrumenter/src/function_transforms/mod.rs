//! The passes that rewrite the program's functions.

pub(crate) mod allocations;
mod frame_fill;
mod line_calls;
pub(crate) mod null_checks;
pub(crate) mod source_function;
mod wrap_body;

use walrus::LocalFunction;
use walrus::ir::{self, Instr, InstrSeqId, Value};

/// Every instruction sequence in the function: its body and nested blocks.
fn sequences(function: &LocalFunction) -> Vec<InstrSeqId> {
    let mut found = Vec::new();
    let mut pending = vec![function.entry_block()];
    while let Some(seq) = pending.pop() {
        found.push(seq);
        for (instr, _) in &function.block(seq).instrs {
            match instr {
                Instr::Block(block) => pending.push(block.seq),
                Instr::Loop(block) => pending.push(block.seq),
                Instr::IfElse(branches) => {
                    pending.push(branches.consequent);
                    pending.push(branches.alternative);
                }
                _ => {}
            }
        }
    }
    found
}

fn const_i32(value: i32) -> Instr {
    Instr::Const(ir::Const {
        value: Value::I32(value),
    })
}
