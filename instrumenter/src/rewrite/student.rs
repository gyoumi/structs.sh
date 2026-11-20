//! Instruments one of the student's functions: fills its frame, and adds the
//! `enter`, `line` and `exit` calls.

use walrus::ir::{self, Instr, InstrSeqType};
use walrus::{FunctionId, MemoryId, Module};

use super::frame_fill::fill_frame;
use super::line_calls::{add_line_calls, loop_statements};
use super::wrap_body::wrap_body;
use super::{const_i32, sequences};
use crate::Imports;
use crate::debug::{DebugInfo, FrameBase, Function};
use crate::parse::Indices;

/// Instruments function `id` if the line table covers it, as function
/// number `number` for `enter`. Returns its C name, or None if it isn't
/// the student's.
pub(crate) fn instrument_function(
    module: &mut Module,
    id: FunctionId,
    number: usize,
    info: &DebugInfo,
    indices: &Indices,
    imports: &Imports,
    memory: Option<MemoryId>,
) -> Option<String> {
    let results = module
        .types
        .get(module.funcs.get(id).ty())
        .results()
        .to_vec();
    let body_type = InstrSeqType::new(&mut module.types, &[], &results);
    let function = module.funcs.get_mut(id).kind.unwrap_local_mut();
    let sequences = sequences(function);
    let offsets = sequences
        .iter()
        .flat_map(|&seq| function.block(seq).instrs.iter().map(|(_, loc)| loc.data()));
    let first = offsets.clone().min()?;
    if !offsets
        .into_iter()
        .any(|offset| info.starts.contains_key(&offset))
    {
        return None;
    }
    let described = info
        .functions
        .iter()
        .find(|function| function.ranges.iter().any(|r| r.contains(&first)));
    let name = described.map_or_else(
        || format!("function {number}"),
        |function| function.name.clone(),
    );
    let frame_base = frame_base(described, id, indices);

    let fill = memory
        .and_then(|memory| fill_frame(function, memory))
        .unwrap_or_default();
    let loop_starts = loop_statements(function, &sequences, &info.starts);
    for &seq in &sequences {
        add_line_calls(
            function,
            seq,
            &info.starts,
            loop_starts.get(&seq).copied(),
            &frame_base,
            imports.line,
        );
    }
    wrap_body(
        function,
        &sequences,
        body_type,
        fill.into_iter()
            .chain([
                const_i32(number as i32),
                Instr::Call(ir::Call {
                    func: imports.enter,
                }),
            ])
            .collect(),
        vec![Instr::Call(ir::Call { func: imports.exit })],
    );
    Some(name)
}

/// The instruction that reads the function's frame base, or 0 if it's not
/// known.
fn frame_base(described: Option<&Function>, id: FunctionId, indices: &Indices) -> Instr {
    match described.and_then(|function| function.frame_base) {
        Some(FrameBase::Local(index)) => indices
            .locals
            .get(&(id, index))
            .map(|&local| Instr::LocalGet(ir::LocalGet { local })),
        Some(FrameBase::Global(index)) => indices
            .globals
            .get(&index)
            .map(|&global| Instr::GlobalGet(ir::GlobalGet { global })),
        None => None,
    }
    .unwrap_or_else(|| const_i32(0))
}
