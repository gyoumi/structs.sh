//! Reads the compiled program's DWARF debug info (line tables, scopes,
//! variables and types) and writes the `structs.debug` section the client
//! reads. It is about the C program being debugged, not this crate's own
//! debugging.
//!
//! It reads where each of the program's statements starts, the variables in
//! scope there and where they live, and the types of those variables, named
//! the way GDB names them.

mod line_table;
mod scopes;
mod section;
mod struct_fields;
mod type_names;
mod type_reader;
mod types;

use std::collections::{BTreeMap, HashMap};
use std::ops::Range;

use gimli::{EndianSlice, LittleEndian, UnitOffset};
use walrus::Module;

pub(crate) use section::section_json;
use types::Type;

type Dwarf<'a> = gimli::Dwarf<EndianSlice<'a, LittleEndian>>;
type Unit<'a> = gimli::Unit<EndianSlice<'a, LittleEndian>>;
type Entry<'a, 'u> = gimli::DebuggingInformationEntry<'a, 'u, EndianSlice<'a, LittleEndian>>;

/// Everything read from the debug info. Offsets are positions in the original
/// file, as walrus's `InstrLocId`s are.
#[derive(Default)]
pub(crate) struct DebugInfo {
    /// Where each statement starts, as an index into `statements`.
    pub starts: BTreeMap<u32, usize>,
    pub statements: Vec<Statement>,
    pub functions: Vec<Function>,
    pub types: Vec<Type>,
}

pub(crate) struct Statement {
    pub line: u32,
    /// The variables in scope, innermost scope first, as GDB lists them.
    pub variables: Vec<Variable>,
}

#[derive(Clone)]
pub(crate) struct Variable {
    pub name: String,
    pub ty: usize,
    /// Where it lives, from the function's frame base.
    pub offset: i64,
}

pub(crate) struct Function {
    pub ranges: Vec<Range<u32>>,
    pub name: String,
    pub frame_base: Option<FrameBase>,
}

/// Where a function's frame base is kept: clang uses a wasm local, or the
/// stack pointer global in a function with nothing on the stack.
#[derive(Clone, Copy)]
pub(crate) enum FrameBase {
    Local(u32),
    Global(u32),
}

// walrus keeps the DWARF as a `Dwarf<Vec<u8>>`, not the `DwarfSections` gimli
// now prefers, so the older `Dwarf::borrow` is the way to read it.
#[allow(deprecated)]
pub(crate) fn read_debug_info(module: &Module, code_start: u32) -> Result<DebugInfo, String> {
    let dwarf: Dwarf = module
        .debug
        .dwarf
        .borrow(|section| EndianSlice::new(section.as_slice(), LittleEndian));
    read(&dwarf, code_start).map_err(|error| format!("could not read the debug info: {error}"))
}

fn read(dwarf: &Dwarf, code_start: u32) -> gimli::Result<DebugInfo> {
    let mut info = DebugInfo::default();
    let mut headers = dwarf.units();
    while let Some(header) = headers.next()? {
        let unit = dwarf.unit(header)?;
        let mut reader = UnitReader {
            dwarf,
            unit: &unit,
            types: &mut info.types,
            seen: HashMap::new(),
        };

        // Each statement's address in the unit, and its line.
        let rows = reader.statement_rows()?;

        let mut functions = Vec::new();
        let mut tree = unit.entries_tree(None)?;
        let root = tree.root()?;
        let mut children = root.children();
        while let Some(child) = children.next()? {
            if child.entry().tag() == gimli::DW_TAG_subprogram
                && let Some(function) = reader.function(child)?
            {
                functions.push(function);
            }
        }

        for (address, line) in rows {
            let offset = code_start + address as u32;
            if info.starts.contains_key(&offset) {
                continue;
            }
            let variables = functions
                .iter()
                .find(|(_, scopes)| scopes[0].ranges.iter().any(|r| r.contains(&address)))
                .map(|(_, scopes)| scopes::visible(scopes, address))
                .unwrap_or_default();
            info.starts.insert(offset, info.statements.len());
            info.statements.push(Statement { line, variables });
        }

        for (function, scopes) in functions {
            info.functions.push(Function {
                ranges: scopes[0]
                    .ranges
                    .iter()
                    .map(|r| code_start + r.start as u32..code_start + r.end as u32)
                    .collect(),
                ..function
            });
        }
    }
    Ok(info)
}

struct UnitReader<'a, 'u> {
    dwarf: &'u Dwarf<'a>,
    unit: &'u Unit<'a>,
    types: &'u mut Vec<Type>,
    /// Types already read, by their place in the unit.
    seen: HashMap<UnitOffset, usize>,
}

impl UnitReader<'_, '_> {
    fn string(&self, entry: &Entry, attribute: gimli::DwAt) -> gimli::Result<Option<String>> {
        entry
            .attr_value(attribute)?
            .map(|value| {
                let name = self.dwarf.attr_string(self.unit, value)?;
                Ok(String::from_utf8_lossy(name.slice()).into_owned())
            })
            .transpose()
    }

    fn number(entry: &Entry, attribute: gimli::DwAt) -> gimli::Result<Option<u64>> {
        Ok(entry
            .attr_value(attribute)?
            .and_then(|value| value.udata_value()))
    }

    fn ranges(&self, entry: &Entry) -> gimli::Result<Vec<Range<u64>>> {
        let mut found = Vec::new();
        let mut ranges = self.dwarf.die_ranges(self.unit, entry)?;
        while let Some(range) = ranges.next()? {
            found.push(range.begin..range.end);
        }
        Ok(found)
    }
}
