//! Rewrites a student's program, compiled to wasm by clang in the browser,
//! so the debugger can record it as it runs.
//!
//! For each of the student's functions, it adds calls to three functions the
//! runner provides (see `client/src/Services/debugger/wasm/run.ts`):
//!
//! - `structs.enter(function)` when the function starts, where `function`
//!   indexes the `structs.functions` custom section, a JSON array of the
//!   functions' C names.
//! - `structs.line(line)` at the start of each statement, from the DWARF line
//!   table.
//! - `structs.exit()` when the function returns.
//!
//! The student's functions are the ones the line table covers. The C library
//! has no debug info, so it gets no calls and stepping goes over it.
//!
//! The browser loads this crate as `wasm32-unknown-unknown`. Only bytes cross
//! the boundary, so it needs no `wasm-bindgen`: see `ffi` below and
//! `client/src/Services/debugger/wasm/instrumenter.ts`.

use std::collections::{BTreeMap, HashMap, HashSet};
use std::ops::Range;

use gimli::{EndianSlice, LittleEndian};
use walrus::ir::{self, Instr, InstrLocId, InstrSeqId, InstrSeqType, Value};
use walrus::{FunctionId, LocalFunction, Module, RawCustomSection, ValType};

type Dwarf<'a> = gimli::Dwarf<EndianSlice<'a, LittleEndian>>;

/// What the line table and function entries say about the student's code.
/// Offsets are positions in the original file, as walrus's `InstrLocId`s are.
#[derive(Default)]
struct DebugInfo {
    /// Where each statement starts, and its line.
    statements: BTreeMap<u32, u32>,
    /// Each function's code, and its C name.
    functions: Vec<(Range<u32>, String)>,
}

/// Instruments a compiled program, returning the rewritten module.
pub fn instrument(wasm: &[u8]) -> Result<Vec<u8>, String> {
    let mut module = Module::from_buffer(wasm).map_err(|error| format!("{error:#}"))?;
    let info = read_debug_info(&module, code_section_start(wasm)?)?;
    if info.statements.is_empty() {
        return Ok(module.emit_wasm());
    }

    let line_type = module.types.add(&[ValType::I32], &[]);
    let exit_type = module.types.add(&[], &[]);
    let (line, _) = module.add_import_func("structs", "line", line_type);
    let (enter, _) = module.add_import_func("structs", "enter", line_type);
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
            .any(|offset| info.statements.contains_key(&offset))
        {
            continue;
        }
        let name = info
            .functions
            .iter()
            .find(|(range, _)| range.contains(&first))
            .map_or_else(
                || format!("function {}", names.len()),
                |(_, name)| name.clone(),
            );

        let loop_starts = loop_statements(function, &sequences, &info.statements);
        for &seq in &sequences {
            add_line_calls(
                function,
                seq,
                &info.statements,
                loop_starts.get(&seq).copied(),
                line,
            );
        }
        add_enter_and_exit(function, &sequences, body_type, names.len(), enter, exit);
        names.push(name);
    }

    module.customs.add(RawCustomSection {
        name: "structs.functions".to_string(),
        data: json_strings(&names).into_bytes(),
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
    read_units(&dwarf, code_start)
        .map_err(|error| format!("could not read the debug info: {error}"))
}

fn read_units(dwarf: &Dwarf, code_start: u32) -> gimli::Result<DebugInfo> {
    let mut info = DebugInfo::default();
    let mut headers = dwarf.units();
    while let Some(header) = headers.next()? {
        let unit = dwarf.unit(header)?;
        let unit_file = unit.name.map(|name| name.slice().to_vec());

        if let Some(program) = unit.line_program.clone() {
            let mut rows = program.rows();
            while let Some((header, row)) = rows.next_row()? {
                let Some(line) = row.line() else { continue };
                // Only the student's own file, not code from headers.
                let file = row
                    .file(header)
                    .map(|file| dwarf.attr_string(&unit, file.path_name()))
                    .transpose()?;
                if row.is_stmt()
                    && !row.end_sequence()
                    && file.map(|name| name.slice().to_vec()) == unit_file
                {
                    let offset = code_start + row.address() as u32;
                    info.statements.entry(offset).or_insert(line.get() as u32);
                }
            }
        }

        let mut entries = unit.entries();
        while let Some((_, entry)) = entries.next_dfs()? {
            if entry.tag() != gimli::DW_TAG_subprogram {
                continue;
            }
            let Some(name) = entry.attr_value(gimli::DW_AT_name)? else {
                continue;
            };
            let name =
                String::from_utf8_lossy(dwarf.attr_string(&unit, name)?.slice()).into_owned();
            let mut ranges = dwarf.die_ranges(&unit, entry)?;
            while let Some(range) = ranges.next()? {
                let start = code_start + range.begin as u32;
                let end = code_start + range.end as u32;
                info.functions.push((start..end, name.clone()));
            }
        }
    }
    Ok(info)
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
    statements: &BTreeMap<u32, u32>,
) -> HashMap<InstrSeqId, u32> {
    let mut found = HashMap::new();
    for &seq in sequences {
        for (instr, loc) in &function.block(seq).instrs {
            if let (Instr::Loop(body), Some(&line)) = (instr, statements.get(&loc.data())) {
                found.insert(body.seq, line);
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
    statements: &BTreeMap<u32, u32>,
    loop_start: Option<u32>,
    line: FunctionId,
) {
    let call_line = |number: u32| {
        [
            (const_i32(number as i32), InstrLocId::default()),
            (Instr::Call(ir::Call { func: line }), InstrLocId::default()),
        ]
    };
    let instrs = std::mem::take(&mut function.block_mut(seq).instrs);
    let mut rewritten = Vec::with_capacity(instrs.len());
    if let Some(number) = loop_start {
        rewritten.extend(call_line(number));
    }
    for (instr, loc) in instrs {
        if let Some(&number) = statements.get(&loc.data())
            && !matches!(instr, Instr::Loop(_))
        {
            rewritten.extend(call_line(number));
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

/// A JSON array of strings.
fn json_strings(strings: &[String]) -> String {
    let quoted: Vec<String> = strings
        .iter()
        .map(|string| {
            let mut out = String::from("\"");
            for character in string.chars() {
                match character {
                    '"' => out.push_str("\\\""),
                    '\\' => out.push_str("\\\\"),
                    c if c.is_control() => out.push_str(&format!("\\u{:04x}", c as u32)),
                    c => out.push(c),
                }
            }
            out.push('"');
            out
        })
        .collect();
    format!("[{}]", quoted.join(","))
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
