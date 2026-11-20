//! The instrumenter adds calls to `structs.line`, `structs.enter` and
//! `structs.exit` to the program's functions, and describes their statements,
//! variables and types in a `structs.debug` section. Whether the calls happen
//! in the right places, and the variables read right, is tested by running
//! programs: see client/src/Services/debugger/wasm/recording.test.ts.

use structs_instrumenter::instrument;
use wasmparser::{Parser, Payload, Validator};

/// Programs from e2e/programs, compiled as the browser compiles them (see
/// fixtures/README.md).
const FIXTURES: [(&str, &[u8]); 3] = [
    ("hello", include_bytes!("fixtures/hello.wasm")),
    ("functions", include_bytes!("fixtures/functions.wasm")),
    ("linked_list", include_bytes!("fixtures/linked_list.wasm")),
];

/// Calls the instrumenter adds, which every instrumented program imports.
const TRACE_IMPORTS: [&str; 7] = [
    "structs.allocated",
    "structs.enter",
    "structs.exit",
    "structs.freed",
    "structs.line",
    "structs.null",
    "structs.reallocated",
];

/// The module's imports ("module.name"), exports and `structs.debug`.
fn read(wasm: &[u8]) -> (Vec<String>, Vec<String>, Option<String>) {
    let mut imports = Vec::new();
    let mut exports = Vec::new();
    let mut functions = None;
    for payload in Parser::new(0).parse_all(wasm) {
        match payload.expect("a readable module") {
            Payload::ImportSection(section) => {
                for import in section.into_imports() {
                    let import = import.expect("a readable import");
                    imports.push(format!("{}.{}", import.module, import.name));
                }
            }
            Payload::ExportSection(section) => {
                for export in section {
                    exports.push(export.expect("a readable export").name.to_string());
                }
            }
            Payload::CustomSection(section) if section.name() == "structs.debug" => {
                functions = Some(String::from_utf8(section.data().to_vec()).unwrap());
            }
            _ => {}
        }
    }
    imports.sort();
    exports.sort();
    (imports, exports, functions)
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
fn every_program_gains_the_trace_imports_and_keeps_its_exports() {
    for (name, wasm) in FIXTURES {
        let (imports, exports, _) = read(wasm);
        let (new_imports, new_exports, _) = read(&instrument(wasm).unwrap());

        let mut expected = imports.clone();
        expected.extend(TRACE_IMPORTS.map(String::from));
        expected.sort();
        assert_eq!(new_imports, expected, "{name}");
        assert_eq!(new_exports, exports, "{name}");
    }
}

/// The `structs.debug` section of an instrumented fixture.
fn debug_section(wasm: &[u8]) -> String {
    read(&instrument(wasm).unwrap())
        .2
        .expect("a structs.debug section")
}

#[test]
fn the_programs_functions_are_listed_by_their_c_names() {
    // clang compiles `int main(void)` as `__original_main`; the debug info
    // still calls it `main`.
    assert!(debug_section(FIXTURES[1].1).starts_with(r#"{"functions":["square","main"],"#));
}

#[test]
fn each_statement_lists_the_variables_in_scope_with_where_they_live() {
    let debug = debug_section(FIXTURES[1].1);

    // square's parameter, then its local, each at an offset from the frame.
    assert!(
        debug.contains(r#"{"line":3,"variables":[{"name":"x","type":0,"offset":12},{"name":"result","type":0,"offset":8}]}"#),
        "{debug}"
    );
    assert!(
        debug.contains(r#"{"kind":"int","name":"int","size":4,"signed":true}"#),
        "{debug}"
    );
}

#[test]
fn types_are_named_as_gdb_names_them() {
    let debug = debug_section(FIXTURES[2].1);

    assert!(
        debug.contains(r#""kind":"pointer","name":"struct node *","size":4,"to":"#),
        "{debug}"
    );
    assert!(
        debug.contains(
            r#""kind":"struct","name":"struct node","size":8,"fields":[{"name":"value","type":"#
        ),
        "{debug}"
    );
}

#[test]
fn a_program_without_debug_info_is_left_alone() {
    let mut module = walrus::Module::default();
    let mut start = walrus::FunctionBuilder::new(&mut module.types, &[], &[]);
    start.func_body().i32_const(0).drop();
    let start = start.finish(vec![], &mut module.funcs);
    module.exports.add("_start", start);
    let wasm = module.emit_wasm();

    let (imports, _, functions) = read(&instrument(&wasm).unwrap());

    assert!(imports.is_empty());
    assert_eq!(functions, None);
}

#[test]
fn bytes_that_are_not_wasm_are_an_error() {
    let error = instrument(b"int main(void) { return 0; }").unwrap_err();
    assert!(!error.is_empty());
}
