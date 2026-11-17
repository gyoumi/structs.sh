//! For now the instrumenter changes nothing: every program must come out as a
//! valid module with the same imports and exports it went in with.

use structs_instrumenter::instrument;
use wasmparser::{Parser, Payload, Validator};

/// Programs from e2e/programs, compiled as the browser compiles them (see
/// fixtures/README.md).
const FIXTURES: [(&str, &[u8]); 3] = [
    ("hello", include_bytes!("fixtures/hello.wasm")),
    ("functions", include_bytes!("fixtures/functions.wasm")),
    ("linked_list", include_bytes!("fixtures/linked_list.wasm")),
];

/// The module's imports and exports, as "module.name" and "name".
fn interface(wasm: &[u8]) -> (Vec<String>, Vec<String>) {
    let mut imports = Vec::new();
    let mut exports = Vec::new();
    for payload in Parser::new(0).parse_all(wasm) {
        match payload.expect("a readable module") {
            Payload::ImportSection(section) => {
                for import in section {
                    let import = import.expect("a readable import");
                    imports.push(format!("{}.{}", import.module, import.name));
                }
            }
            Payload::ExportSection(section) => {
                for export in section {
                    exports.push(export.expect("a readable export").name.to_string());
                }
            }
            _ => {}
        }
    }
    imports.sort();
    exports.sort();
    (imports, exports)
}

#[test]
fn every_program_comes_out_valid() {
    for (name, wasm) in FIXTURES {
        let output = instrument(wasm).unwrap_or_else(|error| panic!("{name}: {error}"));
        Validator::new()
            .validate_all(&output)
            .unwrap_or_else(|error| panic!("{name}: invalid output: {error}"));
    }
}

#[test]
fn every_program_keeps_its_imports_and_exports() {
    for (name, wasm) in FIXTURES {
        let output = instrument(wasm).unwrap();
        assert_eq!(interface(&output), interface(wasm), "{name}");
    }
}

#[test]
fn bytes_that_are_not_wasm_are_an_error() {
    let error = instrument(b"int main(void) { return 0; }").unwrap_err();
    assert!(!error.is_empty());
}
