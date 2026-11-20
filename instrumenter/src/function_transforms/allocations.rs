//! Reports the C library's allocations and frees to the runner.

use walrus::ir::{self, BinaryOp, Instr, InstrSeqType};
use walrus::{FunctionId, LocalId, Module, ValType};

use super::{sequences, wrap_body::wrap_body};
use crate::Imports;

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

impl Allocation {
    fn named(name: Option<&str>) -> Option<Allocation> {
        match name {
            Some("malloc" | "dlmalloc") => Some(Allocation::Malloc),
            Some("calloc" | "dlcalloc") => Some(Allocation::Calloc),
            Some("realloc" | "dlrealloc") => Some(Allocation::Realloc),
            Some("free" | "dlfree") => Some(Allocation::Free),
            _ => None,
        }
    }

    /// The parameters and results the function must have to be wrapped.
    fn signature(&self) -> (&'static [ValType], &'static [ValType]) {
        match self {
            Allocation::Malloc => (&[ValType::I32], &[ValType::I32]),
            Allocation::Calloc | Allocation::Realloc => {
                (&[ValType::I32, ValType::I32], &[ValType::I32])
            }
            Allocation::Free => (&[ValType::I32], &[]),
        }
    }
}

/// Spare locals the wrapping keeps values in.
struct Kept {
    first: LocalId,
    size: LocalId,
    result: LocalId,
}

/// Reports each allocation and free from the C library. `malloc` calls
/// `dlmalloc`, and both are wrapped where present: the runner doesn't mind
/// hearing of one allocation twice.
pub(crate) fn track_allocations(module: &mut Module, code: &[FunctionId], imports: &Imports) {
    for &id in code {
        let Some(kind) = Allocation::named(module.funcs.get(id).name.as_deref()) else {
            continue;
        };
        let ty = module.types.get(module.funcs.get(id).ty());
        let (params, results) = (ty.params().to_vec(), ty.results().to_vec());
        if (params.as_slice(), results.as_slice()) != kind.signature() {
            continue;
        }
        let body_type = InstrSeqType::new(&mut module.types, &[], &results);
        let kept = Kept {
            first: module.locals.add(ValType::I32),
            size: module.locals.add(ValType::I32),
            result: module.locals.add(ValType::I32),
        };
        let function = module.funcs.get_mut(id).kind.unwrap_local_mut();
        let (before, after) = report(&kind, &function.args, &kept, imports);
        let sequences = sequences(function);
        wrap_body(function, &sequences, body_type, before, after);
    }
}

/// What runs before and after an allocation function to report it.
fn report(
    kind: &Allocation,
    args: &[LocalId],
    kept: &Kept,
    imports: &Imports,
) -> (Vec<Instr>, Vec<Instr>) {
    let Kept {
        first,
        size,
        result,
    } = *kept;
    let get = |local| Instr::LocalGet(ir::LocalGet { local });
    let set = |local| Instr::LocalSet(ir::LocalSet { local });
    let call = |func| Instr::Call(ir::Call { func });
    // The arguments are kept as they came in: the function may reuse them.
    match kind {
        Allocation::Malloc => (
            vec![get(args[0]), set(size)],
            vec![
                set(result),
                get(result),
                get(size),
                call(imports.allocated),
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
                call(imports.allocated),
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
                call(imports.reallocated),
                get(result),
            ],
        ),
        Allocation::Free => (vec![get(args[0]), call(imports.freed)], Vec::new()),
    }
}
