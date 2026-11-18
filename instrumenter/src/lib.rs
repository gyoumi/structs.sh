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
//! It also tells the runner about the heap and stops NULL dereferences:
//!
//! - `structs.allocated(pointer, size)`, `structs.freed(pointer)` and
//!   `structs.reallocated(old, new, size)` from the C library's `malloc`,
//!   `calloc`, `realloc` and `free`, found by name.
//! - `structs.null()` before any load, store, `memory.copy` or `memory.fill`
//!   of an address below 1024, where nothing in a C program lives (data starts
//!   at 1024). It throws, which stops the program. In wasm, address 0 is
//!   ordinary memory, so without it a NULL dereference reads or writes quietly.
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
use walrus::ir::{self, BinaryOp, Instr, InstrLocId, InstrSeqId, InstrSeqType, StoreKind, Value};
use walrus::{
    FunctionBuilder, FunctionId, GlobalId, LocalFunction, LocalId, Module, ModuleConfig,
    ModuleLocals, RawCustomSection, ValType,
};

/// Lower addresses than this are a NULL dereference: wasm-ld puts a C
/// program's data at 1024 and above.
const LOWEST_VALID_ADDRESS: i32 = 1024;

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
    let two_i32_type = module.types.add(&[ValType::I32, ValType::I32], &[]);
    let three_i32_type = module
        .types
        .add(&[ValType::I32, ValType::I32, ValType::I32], &[]);
    let no_type = module.types.add(&[], &[]);
    let (line, _) = module.add_import_func("structs", "line", two_i32_type);
    let (enter, _) = module.add_import_func("structs", "enter", i32_type);
    let (exit, _) = module.add_import_func("structs", "exit", no_type);
    let (allocated, _) = module.add_import_func("structs", "allocated", two_i32_type);
    let (freed, _) = module.add_import_func("structs", "freed", i32_type);
    let (reallocated, _) = module.add_import_func("structs", "reallocated", three_i32_type);
    let (null, _) = module.add_import_func("structs", "null", no_type);

    let code: Vec<FunctionId> = module.funcs.iter_local().map(|(id, _)| id).collect();

    let mut names = Vec::new();
    for &id in &code {
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
        wrap_body(
            function,
            &sequences,
            body_type,
            vec![
                const_i32(names.len() as i32),
                Instr::Call(ir::Call { func: enter }),
            ],
            vec![Instr::Call(ir::Call { func: exit })],
        );
        names.push(name);
    }

    // After the line calls, which place themselves by the original
    // instructions' offsets: the instructions added here have none.
    let check = add_null_check(&mut module, null);
    for &id in &code {
        let function = module.funcs.get_mut(id).kind.unwrap_local_mut();
        add_null_checks(function, &mut module.locals, check);
    }
    track_allocations(&mut module, &code, allocated, freed, reallocated);

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
/// off the end, `return`, or a branch to the function's own label, runs
/// `after`, with any results on the stack. `before` runs first.
fn wrap_body(
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

/// Adds `check(address, offset) -> address`, which calls `null` when
/// `address + offset` is below `LOWEST_VALID_ADDRESS`. The offset is the
/// instruction's own: clang reads a global as address 0 plus its offset.
fn add_null_check(module: &mut Module, null: FunctionId) -> FunctionId {
    let address = module.locals.add(ValType::I32);
    let offset = module.locals.add(ValType::I32);
    let mut check = FunctionBuilder::new(
        &mut module.types,
        &[ValType::I32, ValType::I32],
        &[ValType::I32],
    );
    check
        .func_body()
        .local_get(address)
        .local_get(offset)
        .binop(BinaryOp::I32Add)
        .i32_const(LOWEST_VALID_ADDRESS)
        .binop(BinaryOp::I32LtU)
        .if_else(
            None,
            |then| {
                then.call(null);
            },
            |_| {},
        )
        .local_get(address);
    check.finish(vec![address, offset], &mut module.funcs)
}

/// Spare locals for juggling a memory instruction's operands, one of each
/// type, made when first needed.
struct Spares<'a> {
    locals: &'a mut ModuleLocals,
    made: HashMap<(ValType, u8), LocalId>,
}

impl Spares<'_> {
    fn get(&mut self, ty: ValType, which: u8) -> LocalId {
        *self
            .made
            .entry((ty, which))
            .or_insert_with(|| self.locals.add(ty))
    }
}

/// Runs `check` on the address of every load, store, `memory.copy` and
/// `memory.fill`. The address is under the stored value, so a store sets the
/// value aside first.
fn add_null_checks(function: &mut LocalFunction, locals: &mut ModuleLocals, check: FunctionId) {
    let mut spares = Spares {
        locals,
        made: HashMap::new(),
    };
    // The check takes the instruction's offset, as a 32-bit number.
    let call = |offset: u64| {
        [
            const_i32(offset as u32 as i32),
            Instr::Call(ir::Call { func: check }),
        ]
    };
    for seq in sequences(function) {
        let instrs = std::mem::take(&mut function.block_mut(seq).instrs);
        let mut rewritten = Vec::with_capacity(instrs.len());
        for (instr, loc) in instrs {
            let before = match &instr {
                Instr::Load(load) => call(load.arg.offset).to_vec(),
                Instr::Store(store) => {
                    let ty = match store.kind {
                        StoreKind::I32 { .. }
                        | StoreKind::I32_8 { .. }
                        | StoreKind::I32_16 { .. } => ValType::I32,
                        StoreKind::I64 { .. }
                        | StoreKind::I64_8 { .. }
                        | StoreKind::I64_16 { .. }
                        | StoreKind::I64_32 { .. } => ValType::I64,
                        StoreKind::F32 => ValType::F32,
                        StoreKind::F64 => ValType::F64,
                        StoreKind::V128 => ValType::V128,
                    };
                    let value = spares.get(ty, 0);
                    let mut instrs = vec![Instr::LocalSet(ir::LocalSet { local: value })];
                    instrs.extend(call(store.arg.offset));
                    instrs.push(Instr::LocalGet(ir::LocalGet { local: value }));
                    instrs
                }
                Instr::MemoryCopy(_) => {
                    let (length, source) =
                        (spares.get(ValType::I32, 0), spares.get(ValType::I32, 1));
                    let mut instrs = vec![
                        Instr::LocalSet(ir::LocalSet { local: length }),
                        Instr::LocalSet(ir::LocalSet { local: source }),
                    ];
                    instrs.extend(call(0));
                    instrs.push(Instr::LocalGet(ir::LocalGet { local: source }));
                    instrs.extend(call(0));
                    instrs.push(Instr::LocalGet(ir::LocalGet { local: length }));
                    instrs
                }
                Instr::MemoryFill(_) => {
                    let (length, byte) = (spares.get(ValType::I32, 0), spares.get(ValType::I32, 1));
                    let mut instrs = vec![
                        Instr::LocalSet(ir::LocalSet { local: length }),
                        Instr::LocalSet(ir::LocalSet { local: byte }),
                    ];
                    instrs.extend(call(0));
                    instrs.push(Instr::LocalGet(ir::LocalGet { local: byte }));
                    instrs.push(Instr::LocalGet(ir::LocalGet { local: length }));
                    instrs
                }
                _ => Vec::new(),
            };
            rewritten.extend(
                before
                    .into_iter()
                    .map(|instr| (instr, InstrLocId::default())),
            );
            rewritten.push((instr, loc));
        }
        function.block_mut(seq).instrs = rewritten;
    }
}

/// How one of the C library's allocation functions is reported.
enum Allocation {
    /// `malloc(size)`.
    Malloc,
    /// `calloc(count, size)`.
    Calloc,
    /// `realloc(pointer, size)`.
    Realloc,
    /// `free(pointer)`.
    Free,
}

/// Reports each allocation and free from the C library. `malloc` calls
/// `dlmalloc`, and both are wrapped where present: the runner doesn't mind
/// hearing of one allocation twice.
fn track_allocations(
    module: &mut Module,
    code: &[FunctionId],
    allocated: FunctionId,
    freed: FunctionId,
    reallocated: FunctionId,
) {
    for &id in code {
        let kind = match module.funcs.get(id).name.as_deref() {
            Some("malloc" | "dlmalloc") => Allocation::Malloc,
            Some("calloc" | "dlcalloc") => Allocation::Calloc,
            Some("realloc" | "dlrealloc") => Allocation::Realloc,
            Some("free" | "dlfree") => Allocation::Free,
            _ => continue,
        };
        let ty = module.types.get(module.funcs.get(id).ty());
        let (params, results) = (ty.params().to_vec(), ty.results().to_vec());
        let expected: (&[ValType], &[ValType]) = match kind {
            Allocation::Malloc => (&[ValType::I32], &[ValType::I32]),
            Allocation::Calloc | Allocation::Realloc => {
                (&[ValType::I32, ValType::I32], &[ValType::I32])
            }
            Allocation::Free => (&[ValType::I32], &[]),
        };
        if (params.as_slice(), results.as_slice()) != expected {
            continue;
        }
        let body_type = InstrSeqType::new(&mut module.types, &[], &results);
        let (first, size, result) = (
            module.locals.add(ValType::I32),
            module.locals.add(ValType::I32),
            module.locals.add(ValType::I32),
        );
        let function = module.funcs.get_mut(id).kind.unwrap_local_mut();
        let args = function.args.clone();
        let get = |local| Instr::LocalGet(ir::LocalGet { local });
        let set = |local| Instr::LocalSet(ir::LocalSet { local });
        let call = |func| Instr::Call(ir::Call { func });
        // The arguments are kept as they came in: the function may reuse them.
        let (before, after) = match kind {
            Allocation::Malloc => (
                vec![get(args[0]), set(size)],
                vec![
                    set(result),
                    get(result),
                    get(size),
                    call(allocated),
                    get(result),
                ],
            ),
            Allocation::Calloc => (
                vec![
                    get(args[0]),
                    get(args[1]),
                    Instr::Binop(ir::Binop {
                        op: BinaryOp::I32Mul,
                    }),
                    set(size),
                ],
                vec![
                    set(result),
                    get(result),
                    get(size),
                    call(allocated),
                    get(result),
                ],
            ),
            Allocation::Realloc => (
                vec![get(args[0]), set(first), get(args[1]), set(size)],
                vec![
                    set(result),
                    get(first),
                    get(result),
                    get(size),
                    call(reallocated),
                    get(result),
                ],
            ),
            Allocation::Free => (vec![get(args[0]), call(freed)], Vec::new()),
        };
        let sequences = sequences(function);
        wrap_body(function, &sequences, body_type, before, after);
    }
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
