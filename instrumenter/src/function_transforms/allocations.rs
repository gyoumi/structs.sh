use walrus::ir::{self, BinaryOp, Instr, InstrSeqType};
use walrus::{FunctionId, LocalId, Module, ValType};

use super::{sequences, wrap_body::wrap_body};
use crate::Imports;

enum AllocatorFn {
    Malloc,
    Calloc,
    Realloc,
    Free,
}

impl AllocatorFn {
    fn named(name: Option<&str>) -> Option<AllocatorFn> {
        match name {
            Some("malloc" | "dlmalloc") => Some(AllocatorFn::Malloc),
            Some("calloc" | "dlcalloc") => Some(AllocatorFn::Calloc),
            Some("realloc" | "dlrealloc") => Some(AllocatorFn::Realloc),
            Some("free" | "dlfree") => Some(AllocatorFn::Free),
            _ => None,
        }
    }

    fn signature(&self) -> (&'static [ValType], &'static [ValType]) {
        match self {
            AllocatorFn::Malloc => (&[ValType::I32], &[ValType::I32]),
            AllocatorFn::Calloc | AllocatorFn::Realloc => {
                (&[ValType::I32, ValType::I32], &[ValType::I32])
            }
            AllocatorFn::Free => (&[ValType::I32], &[]),
        }
    }
}

struct SavedLocals {
    old_ptr: LocalId,
    size: LocalId,
    result: LocalId,
}

/// `malloc` calls `dlmalloc`, and both are wrapped where present: the runner
/// doesn't mind hearing of one allocation twice.
pub(crate) fn track_allocations(module: &mut Module, functions: &[FunctionId], imports: &Imports) {
    for &id in functions {
        let Some(kind) = AllocatorFn::named(module.funcs.get(id).name.as_deref()) else {
            continue;
        };
        let ty = module.types.get(module.funcs.get(id).ty());
        let (params, results) = (ty.params().to_vec(), ty.results().to_vec());
        if (params.as_slice(), results.as_slice()) != kind.signature() {
            continue;
        }
        let body_type = InstrSeqType::new(&mut module.types, &[], &results);
        let saved = SavedLocals {
            old_ptr: module.locals.add(ValType::I32),
            size: module.locals.add(ValType::I32),
            result: module.locals.add(ValType::I32),
        };
        let function = module.funcs.get_mut(id).kind.unwrap_local_mut();
        let (before, after) = allocator_hooks(&kind, &function.args, &saved, imports);
        let sequences = sequences(function);
        wrap_body(function, &sequences, body_type, before, after);
    }
}

fn allocator_hooks(
    kind: &AllocatorFn,
    args: &[LocalId],
    saved: &SavedLocals,
    imports: &Imports,
) -> (Vec<Instr>, Vec<Instr>) {
    let SavedLocals {
        old_ptr,
        size,
        result,
    } = *saved;
    let get = |local| Instr::LocalGet(ir::LocalGet { local });
    let set = |local| Instr::LocalSet(ir::LocalSet { local });
    let call = |func| Instr::Call(ir::Call { func });
    // The arguments are kept as they came in: the function may reuse them.
    match kind {
        AllocatorFn::Malloc => (
            vec![get(args[0]), set(size)],
            vec![
                set(result),
                get(result),
                get(size),
                call(imports.allocated),
                get(result),
            ],
        ),
        AllocatorFn::Calloc => (
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
                call(imports.allocated),
                get(result),
            ],
        ),
        AllocatorFn::Realloc => (
            vec![get(args[0]), set(old_ptr), get(args[1]), set(size)],
            vec![
                set(result),
                get(old_ptr),
                get(result),
                get(size),
                call(imports.reallocated),
                get(result),
            ],
        ),
        AllocatorFn::Free => (vec![get(args[0]), call(imports.freed)], Vec::new()),
    }
}
