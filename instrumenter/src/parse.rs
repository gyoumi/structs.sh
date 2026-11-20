use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use walrus::{FunctionId, GlobalId, LocalId, Module, ModuleConfig};

/// The wasm local and global indices walrus parsed, which the debug info uses.
#[derive(Default)]
pub(crate) struct WasmIndices {
    pub locals: HashMap<(FunctionId, u32), LocalId>,
    pub globals: HashMap<u32, GlobalId>,
}

pub(crate) fn parse(wasm: &[u8]) -> Result<(Module, WasmIndices), String> {
    let indices = Arc::new(Mutex::new(WasmIndices::default()));
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
    let module = config.parse(wasm).map_err(|error| format!("{error:#}"))?;
    let indices = std::mem::take(&mut *indices.lock().unwrap());
    Ok((module, indices))
}

/// Where the code section's contents start. DWARF addresses in wasm count
/// from here.
pub(crate) fn code_section_start(wasm: &[u8]) -> Result<u32, String> {
    for payload in wasmparser::Parser::new(0).parse_all(wasm) {
        if let wasmparser::Payload::CodeSectionStart { range, .. } =
            payload.map_err(|error| error.to_string())?
        {
            return Ok(range.start as u32);
        }
    }
    Ok(0)
}
