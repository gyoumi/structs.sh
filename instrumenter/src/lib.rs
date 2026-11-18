//! Rewrites a student's program, compiled to wasm by clang in the browser,
//! so the debugger can record it as it runs.
//!
//! For each of the student's functions, it adds calls to three functions the
//! runner provides (see `client/src/Services/debugger/wasm/run.ts`):
//!
//! - `structs.enter(function)` when the function starts.
//! - `structs.line(statement, frame_base)` at the start of each statement,
//!   from the DWARF line table, with the function's frame base, from which
//!   its variables can be found.
//! - `structs.exit()` when the function returns.
//!
//! A `structs.debug` custom section, a JSON object, describes them: the
//! functions' C names (indexed by `enter`), each statement's line and the
//! variables in scope there (indexed by `line`), and the variables' types.
//!
//! The student's functions are the ones the line table covers. The C library
//! has no debug info, so it gets no calls and stepping goes over it.
//!
//! The browser loads this crate as `wasm32-unknown-unknown`. Only bytes cross
//! the boundary, so it needs no `wasm-bindgen`: see `ffi` below and
//! `client/src/Services/debugger/wasm/instrumenter.ts`.

mod debug;

use std::collections::{BTreeMap, HashMap, HashSet};
use std::sync::{Arc, Mutex};

use debug::{DebugInfo, Dwarf, FrameBase};
use gimli::{EndianSlice, LittleEndian};
use walrus::ir::{self, Instr, InstrLocId, InstrSeqId, InstrSeqType, Value};
use walrus::{
    FunctionId, GlobalId, LocalFunction, LocalId, Module, ModuleConfig, RawCustomSection, ValType,
};

/// The wasm local and global indices walrus parsed, which the debug info uses.
#[derive(Default)]
struct Indices {
    locals: HashMap<(FunctionId, u32), LocalId>,
    globals: HashMap<u32, GlobalId>,
}

/// Instruments a compiled program, returning the rewritten module.
pub fn instrument(wasm: &[u8]) -> Result<Vec<u8>, String> {
    let indices = Arc::new(Mutex::new(Indices::default()));
    let mut config = ModuleConfig::new();
    let found = Arc::clone(&indices);
    config.on_parse(move |module, ids| {
        let mut found = found.lock().unwrap();
        for (function, _) in module.funcs.iter_local() {
            let mut index = 0;
            while let Ok(local) = ids.get_local(function, index) {
                found.locals.insert((function, index), local);
                index += 1;
            }
        }
        let mut index = 0;
        while let Ok(global) = ids.get_global(index) {
            found.globals.insert(index, global);
            index += 1;
        }
        Ok(())
    });
    let mut module = config.parse(wasm).map_err(|error| format!("{error:#}"))?;
    let indices = std::mem::take(&mut *indices.lock().unwrap());
    let info = read_debug_info(&module, code_section_start(wasm)?)?;
    if info.starts.is_empty() {
        return Ok(module.emit_wasm());
    }

    let i32_type = module.types.add(&[ValType::I32], &[]);
    let line_type = module.types.add(&[ValType::I32, ValType::I32], &[]);
    let exit_type = module.types.add(&[], &[]);
    let (line, _) = module.add_import_func("structs", "line", line_type);
    let (enter, _) = module.add_import_func("structs", "enter", i32_type);
    let (exit, _) = module.add_import_func("structs", "exit", exit_type);

    let mut names = Vec::new();
    let ids: Vec<FunctionId> = module.funcs.iter_local().map(|(id, _)| id).collect();
    for id in ids {
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
        let Some(first) = offsets.clone().min() else {
            continue;
        };
        if !offsets
            .into_iter()
            .any(|offset| info.starts.contains_key(&offset))
        {
            continue;
        }
        let described = info
            .functions
            .iter()
            .find(|function| function.ranges.iter().any(|r| r.contains(&first)));
        let name = described.map_or_else(
            || format!("function {}", names.len()),
            |function| function.name.clone(),
        );
        let frame_base = match described.and_then(|function| function.frame_base) {
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
        .unwrap_or_else(|| const_i32(0));

        let loop_starts = loop_statements(function, &sequences, &info.starts);
        for &seq in &sequences {
            add_line_calls(
                function,
                seq,
                &info.starts,
                loop_starts.get(&seq).copied(),
                &frame_base,
                line,
            );
        }
        add_enter_and_exit(function, &sequences, body_type, names.len(), enter, exit);
        names.push(name);
    }

    module.customs.add(RawCustomSection {
        name: "structs.debug".to_string(),
        data: debug::section_json(&names, &info).into_bytes(),
    });
    Ok(module.emit_wasm())
}

/// Where the code section's contents start. DWARF addresses in wasm count
/// from here.
fn code_section_start(wasm: &[u8]) -> Result<u32, String> {
    for payload in wasmparser::Parser::new(0).parse_all(wasm) {
        if let wasmparser::Payload::CodeSectionStart { range, .. } =
            payload.map_err(|error| error.to_string())?
        {
            return Ok(range.start as u32);
        }
    }
    Ok(0)
}

// walrus keeps the DWARF as a `Dwarf<Vec<u8>>`, not the `DwarfSections` gimli
// now prefers, so the older `Dwarf::borrow` is the way to read it.
#[allow(deprecated)]
fn read_debug_info(module: &Module, code_start: u32) -> Result<DebugInfo, String> {
    let dwarf: Dwarf = module
        .debug
        .dwarf
        .borrow(|section| EndianSlice::new(section.as_slice(), LittleEndian));
    debug::read(&dwarf, code_start)
        .map_err(|error| format!("could not read the debug info: {error}"))
}

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

/// Statements that start on a `loop` instruction, by the loop's body. A
/// branch back to a loop goes to the start of its body, not to the `loop`
/// instruction, so their calls go there to run on every pass.
fn loop_statements(
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
fn add_line_calls(
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

/// Wraps the function's body in a block so that every way out of it, falling
/// off the end, `return`, or a branch to the function's own label, passes a
/// single call to `exit`. The body starts with a call to `enter`.
fn add_enter_and_exit(
    function: &mut LocalFunction,
    sequences: &[InstrSeqId],
    body_type: InstrSeqType,
    index: usize,
    enter: FunctionId,
    exit: FunctionId,
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

    function.block_mut(entry).instrs = vec![
        (const_i32(index as i32), InstrLocId::default()),
        (Instr::Call(ir::Call { func: enter }), InstrLocId::default()),
        (Instr::Block(ir::Block { seq: body }), InstrLocId::default()),
        (Instr::Call(ir::Call { func: exit }), InstrLocId::default()),
    ];
}

fn const_i32(value: i32) -> Instr {
    Instr::Const(ir::Const {
        value: Value::I32(value),
    })
}

/// The functions the browser calls. A call goes:
///
/// 1. `alloc(len)` for the input, which the caller copies in.
/// 2. `instrument(ptr, len)`, which frees the input and returns 0 on success
///    or 1 on failure.
/// 3. `result_ptr()` and `result_len()` to read the output module, or the
///    error message as UTF-8.
/// 4. `free_result()` once the caller has copied it.
#[cfg(target_arch = "wasm32")]
mod ffi {
    use std::cell::RefCell;

    thread_local! {
        static RESULT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn alloc(len: usize) -> *mut u8 {
        let mut buffer = Vec::<u8>::with_capacity(len);
        let pointer = buffer.as_mut_ptr();
        std::mem::forget(buffer);
        pointer
    }

    /// # Safety
    /// `pointer` and `len` must come from one `alloc` call, filled by the
    /// caller. The input is freed here.
    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn instrument(pointer: *mut u8, len: usize) -> u32 {
        let input = unsafe { Vec::from_raw_parts(pointer, len, len) };
        let (status, output) = match super::instrument(&input) {
            Ok(module) => (0, module),
            Err(message) => (1, message.into_bytes()),
        };
        RESULT.with(|result| *result.borrow_mut() = output);
        status
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn result_ptr() -> *const u8 {
        RESULT.with(|result| result.borrow().as_ptr())
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn result_len() -> usize {
        RESULT.with(|result| result.borrow().len())
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn free_result() {
        RESULT.with(|result| *result.borrow_mut() = Vec::new());
    }
}
