//! Rewrites a user's program, compiled to wasm by clang in the browser,
//! so the debugger can record it as it runs.
//!
//! For each of the program's functions, it adds calls to three functions the
//! runner provides (see `client/src/Services/debugger/wasm/run.ts`):
//!
//! - `structs.enter(function)` when the function starts.
//! - `structs.line(statement, frame_base)` at the start of each statement,
//!   from the DWARF line table, with the function's frame base, from which
//!   its variables can be found.
//! - `structs.exit()` when the function returns.
//!
//! Before each of those functions sets up its stack frame, it fills the frame
//! with the byte 0xAA, so an uninitialised local holds garbage, as it can in
//! native C, rather than the zeros fresh wasm memory starts with.
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
//! The program's own functions are the ones the line table covers. The C library
//! has no debug info, so it gets no calls and stepping goes over it.

mod dwarf;
mod function_transforms;
mod parse;

use walrus::{FunctionId, Module, RawCustomSection, ValType};

struct Imports {
    line: FunctionId,
    enter: FunctionId,
    exit: FunctionId,
    allocated: FunctionId,
    freed: FunctionId,
    reallocated: FunctionId,
    null: FunctionId,
}

impl Imports {
    fn add(module: &mut Module) -> Imports {
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
        Imports {
            line,
            enter,
            exit,
            allocated,
            freed,
            reallocated,
            null,
        }
    }
}

pub fn instrument(wasm: &[u8]) -> Result<Vec<u8>, String> {
    let (mut module, indices) = parse::parse(wasm)?;
    let info = dwarf::read_debug_info(&module, parse::code_section_start(wasm)?)?;
    if info.statement_at_offset.is_empty() {
        return Ok(module.emit_wasm());
    }

    let imports = Imports::add(&mut module);
    let compiled = instrument_source_functions(&mut module, &info, &indices, &imports);
    check_nulls_and_track_allocations(&mut module, &compiled, &imports);

    module.customs.add(RawCustomSection {
        name: "structs.debug".to_string(),
        data: dwarf::debug_section_json(&compiled.source_function_names, &info).into_bytes(),
    });
    Ok(module.emit_wasm())
}

struct CompiledFunctions {
    all_function_ids: Vec<FunctionId>,
    source_function_names: Vec<String>,
}

fn instrument_source_functions(
    module: &mut Module,
    info: &dwarf::DebugInfo,
    indices: &parse::WasmIndices,
    imports: &Imports,
) -> CompiledFunctions {
    let all_function_ids: Vec<FunctionId> = module.funcs.iter_local().map(|(id, _)| id).collect();
    let memory = module.memories.iter().next().map(|memory| memory.id());
    let mut source_function_names = Vec::new();
    for &id in &all_function_ids {
        if let Some(name) = function_transforms::source_function::instrument(
            module,
            id,
            source_function_names.len(),
            info,
            indices,
            imports,
            memory,
        ) {
            source_function_names.push(name);
        }
    }
    CompiledFunctions {
        all_function_ids,
        source_function_names,
    }
}

fn check_nulls_and_track_allocations(
    module: &mut Module,
    compiled: &CompiledFunctions,
    imports: &Imports,
) {
    let functions = &compiled.all_function_ids;
    function_transforms::null_checks::add_null_checks(module, functions, imports.null);
    function_transforms::allocations::track_allocations(module, functions, imports);
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
mod ffi;
