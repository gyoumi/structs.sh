use walrus::ir::{self, Instr, InstrSeqType};
use walrus::{FunctionId, MemoryId, Module};

use super::frame_fill::frame_fill_instrs;
use super::line_calls::{add_line_calls, loop_statements};
use super::wrap_body::wrap_body;
use super::{const_i32, sequences};
use crate::Imports;
use crate::dwarf::{DebugInfo, FrameBase, Function};
use crate::parse::WasmIndices;

/// Instruments function `id` if the line table covers it, as function
/// `function_index` for `enter`. Returns its C name, or None if it isn't
/// one of the program's own functions.
pub(crate) fn instrument(
    module: &mut Module,
    id: FunctionId,
    function_index: usize,
    info: &DebugInfo,
    indices: &WasmIndices,
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
        .any(|offset| info.statement_at_offset.contains_key(&offset))
    {
        return None;
    }
    let described = info
        .functions
        .iter()
        .find(|function| function.ranges.iter().any(|r| r.contains(&first)));
    let name = described.map_or_else(
        || format!("function {function_index}"),
        |function| function.name.clone(),
    );
    let frame_base = frame_base(described, id, indices);

    let fill = memory
        .and_then(|memory| frame_fill_instrs(function, memory))
        .unwrap_or_default();
    let loop_starts = loop_statements(function, &sequences, &info.statement_at_offset);
    for &seq in &sequences {
        add_line_calls(
            function,
            seq,
            &info.statement_at_offset,
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
                const_i32(function_index as i32),
                Instr::Call(ir::Call {
                    func: imports.enter,
                }),
            ])
            .collect(),
        vec![Instr::Call(ir::Call { func: imports.exit })],
    );
    Some(name)
}

fn frame_base(described: Option<&Function>, id: FunctionId, indices: &WasmIndices) -> Instr {
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
