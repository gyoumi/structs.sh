//! Fills a function's stack frame so uninitialised locals show garbage.

use walrus::ir::{self, BinaryOp, Instr, Value};
use walrus::{LocalFunction, MemoryId};

use super::const_i32;

/// The byte an uninitialised local holds. Fresh wasm memory is zeroed, so
/// without it an uninitialised `int` would show 0, where GDB shows garbage.
const UNINITIALISED: i32 = 0xAA;

/// Instructions that fill the function's stack frame with `UNINITIALISED`,
/// to run before its prologue, so parameters are stored over the fill. At
/// `-O0`, clang starts a function that has a frame with
/// `global.get $__stack_pointer; i32.const size; i32.sub`, and the frame is
/// the `size` bytes below the stack pointer.
pub(super) fn fill_frame(function: &LocalFunction, memory: MemoryId) -> Option<Vec<Instr>> {
    let instrs = &function.block(function.entry_block()).instrs;
    let [
        (Instr::GlobalGet(stack_pointer), _),
        (Instr::Const(size), _),
        (Instr::Binop(sub), _),
        ..,
    ] = instrs.as_slice()
    else {
        return None;
    };
    let (Value::I32(size), BinaryOp::I32Sub) = (size.value, sub.op) else {
        return None;
    };
    Some(vec![
        Instr::GlobalGet(stack_pointer.clone()),
        const_i32(size),
        Instr::Binop(ir::Binop {
            op: BinaryOp::I32Sub,
        }),
        const_i32(UNINITIALISED),
        const_i32(size),
        Instr::MemoryFill(ir::MemoryFill { memory }),
    ])
}
