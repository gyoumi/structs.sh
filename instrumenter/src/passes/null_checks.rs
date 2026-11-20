//! Stops NULL dereferences: checks the address of every memory access.

use std::collections::HashMap;

use walrus::ir::{self, BinaryOp, Instr, InstrLocId, StoreKind};
use walrus::{FunctionBuilder, FunctionId, LocalFunction, LocalId, Module, ModuleLocals, ValType};

use super::{const_i32, sequences};

/// Lower addresses than this are a NULL dereference: wasm-ld puts a C
/// program's data at 1024 and above.
const LOWEST_VALID_ADDRESS: i32 = 1024;

/// Adds the check, and runs it before every memory access in `code`.
pub(crate) fn check_addresses(module: &mut Module, code: &[FunctionId], null: FunctionId) {
    let check = add_null_check(module, null);
    for &id in code {
        let function = module.funcs.get_mut(id).kind.unwrap_local_mut();
        add_null_checks(function, &mut module.locals, check);
    }
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
    for seq in sequences(function) {
        let instrs = std::mem::take(&mut function.block_mut(seq).instrs);
        let mut rewritten = Vec::with_capacity(instrs.len());
        for (instr, loc) in instrs {
            let before = checks_before(&instr, &mut spares, check);
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

/// What runs before `instr` to check the addresses it reads or writes.
fn checks_before(instr: &Instr, spares: &mut Spares, check: FunctionId) -> Vec<Instr> {
    // The check takes the instruction's offset, as a 32-bit number.
    let call = |offset: u64| {
        [
            const_i32(offset as u32 as i32),
            Instr::Call(ir::Call { func: check }),
        ]
    };
    match instr {
        Instr::Load(load) => call(load.arg.offset).to_vec(),
        Instr::Store(store) => {
            let value = spares.get(stored_type(store.kind), 0);
            let mut instrs = vec![Instr::LocalSet(ir::LocalSet { local: value })];
            instrs.extend(call(store.arg.offset));
            instrs.push(Instr::LocalGet(ir::LocalGet { local: value }));
            instrs
        }
        Instr::MemoryCopy(_) => {
            let (length, source) = (spares.get(ValType::I32, 0), spares.get(ValType::I32, 1));
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
    }
}

/// The type of the value a store writes.
fn stored_type(kind: StoreKind) -> ValType {
    match kind {
        StoreKind::I32 { .. } | StoreKind::I32_8 { .. } | StoreKind::I32_16 { .. } => ValType::I32,
        StoreKind::I64 { .. }
        | StoreKind::I64_8 { .. }
        | StoreKind::I64_16 { .. }
        | StoreKind::I64_32 { .. } => ValType::I64,
        StoreKind::F32 => ValType::F32,
        StoreKind::F64 => ValType::F64,
        StoreKind::V128 => ValType::V128,
    }
}
