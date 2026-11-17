//! Reads what the debugger needs from the DWARF debug info: where each of the
//! student's statements starts, the variables in scope there and where they
//! live, and the types of those variables, named the way GDB names them.

use std::collections::{BTreeMap, HashMap};
use std::fmt::Write;
use std::ops::Range;

use gimli::{AttributeValue, EndianSlice, LittleEndian, UnitOffset};

pub(crate) type Dwarf<'a> = gimli::Dwarf<EndianSlice<'a, LittleEndian>>;
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

pub(crate) enum Type {
    Int {
        name: String,
        size: u64,
        signed: bool,
    },
    Float {
        name: String,
        size: u64,
    },
    Pointer {
        name: String,
        to: Option<usize>,
    },
    Struct {
        name: String,
        size: u64,
        fields: Vec<Field>,
    },
    Array {
        name: String,
        size: u64,
        of: usize,
        count: u64,
    },
    /// A typedef, or a type with `const` or `volatile`.
    Alias {
        name: String,
        size: u64,
        to: Option<usize>,
        typedef: bool,
    },
    /// Anything the debugger doesn't read, such as a function.
    Other {
        name: String,
    },
}

pub(crate) struct Field {
    pub name: String,
    pub ty: usize,
    pub offset: u64,
    /// For a bit-field, its first bit from the struct's start, and its width.
    pub bits: Option<(u64, u64)>,
}

/// wasm32 pointers.
const POINTER_SIZE: u64 = 4;

impl Type {
    fn name(&self) -> &str {
        match self {
            Type::Int { name, .. }
            | Type::Float { name, .. }
            | Type::Pointer { name, .. }
            | Type::Struct { name, .. }
            | Type::Array { name, .. }
            | Type::Alias { name, .. }
            | Type::Other { name } => name,
        }
    }

    fn size(&self) -> u64 {
        match self {
            Type::Int { size, .. }
            | Type::Float { size, .. }
            | Type::Struct { size, .. }
            | Type::Array { size, .. }
            | Type::Alias { size, .. } => *size,
            Type::Pointer { .. } => POINTER_SIZE,
            Type::Other { .. } => 0,
        }
    }
}

/// A scope inside a function: the function itself, or a block within it.
struct Scope {
    ranges: Vec<Range<u64>>,
    depth: usize,
    variables: Vec<Variable>,
}

pub(crate) fn read(dwarf: &Dwarf, code_start: u32) -> gimli::Result<DebugInfo> {
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
                .map(|(_, scopes)| visible(scopes, address))
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

/// The variables in scope at `address`: innermost scope first, and in the
/// order they're declared within each scope, as GDB lists them.
fn visible(scopes: &[Scope], address: u64) -> Vec<Variable> {
    let mut open: Vec<&Scope> = scopes
        .iter()
        .filter(|scope| scope.ranges.iter().any(|r| r.contains(&address)))
        .collect();
    open.sort_by_key(|scope| std::cmp::Reverse(scope.depth));
    open.into_iter()
        .flat_map(|scope| scope.variables.iter().cloned())
        .collect()
}

struct UnitReader<'a, 'u> {
    dwarf: &'u Dwarf<'a>,
    unit: &'u Unit<'a>,
    types: &'u mut Vec<Type>,
    /// Types already read, by their place in the unit.
    seen: HashMap<UnitOffset, usize>,
}

impl<'a> UnitReader<'a, '_> {
    /// The is_stmt rows in the student's own file, not code from headers.
    fn statement_rows(&self) -> gimli::Result<Vec<(u64, u32)>> {
        let mut found = Vec::new();
        let Some(program) = self.unit.line_program.clone() else {
            return Ok(found);
        };
        let unit_file = self.unit.name.map(|name| name.slice().to_vec());
        let mut rows = program.rows();
        while let Some((header, row)) = rows.next_row()? {
            let Some(line) = row.line() else { continue };
            let file = row
                .file(header)
                .map(|file| self.dwarf.attr_string(self.unit, file.path_name()))
                .transpose()?;
            if row.is_stmt()
                && !row.end_sequence()
                && file.map(|name| name.slice().to_vec()) == unit_file
            {
                found.push((row.address(), line.get() as u32));
            }
        }
        Ok(found)
    }

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

    /// A function, and its scopes with the function itself first.
    fn function(
        &mut self,
        node: gimli::EntriesTreeNode<EndianSlice<'a, LittleEndian>>,
    ) -> gimli::Result<Option<(Function, Vec<Scope>)>> {
        let entry = node.entry();
        let Some(name) = self.string(entry, gimli::DW_AT_name)? else {
            return Ok(None);
        };
        let ranges = self.ranges(entry)?;
        if ranges.is_empty() {
            return Ok(None);
        }
        let frame_base = match entry.attr_value(gimli::DW_AT_frame_base)? {
            Some(AttributeValue::Exprloc(expression)) => {
                match expression.operations(self.unit.encoding()).next()? {
                    Some(gimli::Operation::WasmLocal { index }) => Some(FrameBase::Local(index)),
                    Some(gimli::Operation::WasmGlobal { index }) => Some(FrameBase::Global(index)),
                    _ => None,
                }
            }
            _ => None,
        };
        let mut scopes = vec![Scope {
            ranges,
            depth: 0,
            variables: Vec::new(),
        }];
        self.scope(node, 0, &mut scopes)?;
        Ok(Some((
            Function {
                ranges: Vec::new(),
                name,
                frame_base,
            },
            scopes,
        )))
    }

    /// Reads the variables declared directly in scope `index`, and the blocks
    /// nested inside it.
    fn scope(
        &mut self,
        node: gimli::EntriesTreeNode<EndianSlice<'a, LittleEndian>>,
        index: usize,
        scopes: &mut Vec<Scope>,
    ) -> gimli::Result<()> {
        let depth = scopes[index].depth;
        let mut children = node.children();
        while let Some(child) = children.next()? {
            let entry = child.entry();
            match entry.tag() {
                gimli::DW_TAG_formal_parameter | gimli::DW_TAG_variable => {
                    if let Some(variable) = self.variable(entry)? {
                        scopes[index].variables.push(variable);
                    }
                }
                gimli::DW_TAG_lexical_block => {
                    let ranges = self.ranges(entry)?;
                    scopes.push(Scope {
                        ranges,
                        depth: depth + 1,
                        variables: Vec::new(),
                    });
                    let nested = scopes.len() - 1;
                    self.scope(child, nested, scopes)?;
                }
                _ => {}
            }
        }
        Ok(())
    }

    /// A variable that lives at a fixed place in its function's frame. Others,
    /// such as `static` ones, aren't shown.
    fn variable(&mut self, entry: &Entry) -> gimli::Result<Option<Variable>> {
        let Some(name) = self.string(entry, gimli::DW_AT_name)? else {
            return Ok(None);
        };
        let Some(AttributeValue::Exprloc(location)) = entry.attr_value(gimli::DW_AT_location)?
        else {
            return Ok(None);
        };
        let mut operations = location.operations(self.unit.encoding());
        let Some(gimli::Operation::FrameOffset { offset }) = operations.next()? else {
            return Ok(None);
        };
        if operations.next()?.is_some() {
            return Ok(None);
        }
        let Some(ty) = self.type_attribute(entry)? else {
            return Ok(None);
        };
        Ok(Some(Variable { name, ty, offset }))
    }

    /// The type an entry's `DW_AT_type` names, or None for `void`.
    fn type_attribute(&mut self, entry: &Entry) -> gimli::Result<Option<usize>> {
        match entry.attr_value(gimli::DW_AT_type)? {
            Some(AttributeValue::UnitRef(offset)) => self.type_at(offset).map(Some),
            _ => Ok(None),
        }
    }

    fn name_of(&self, ty: Option<usize>) -> String {
        ty.map_or_else(
            || "void".to_string(),
            |ty| self.types[ty].name().to_string(),
        )
    }

    /// Adds a type now, before its parts, so a type that refers back to
    /// itself (`struct node *next`) finds it. `fill` then replaces it.
    fn placeholder(&mut self, offset: UnitOffset, name: String) -> usize {
        self.types.push(Type::Other { name });
        let index = self.types.len() - 1;
        self.seen.insert(offset, index);
        index
    }

    fn type_at(&mut self, offset: UnitOffset) -> gimli::Result<usize> {
        if let Some(&index) = self.seen.get(&offset) {
            return Ok(index);
        }
        let unit = self.unit;
        let entry = unit.entry(offset)?;
        let name = self.string(&entry, gimli::DW_AT_name)?;
        let size = Self::number(&entry, gimli::DW_AT_byte_size)?.unwrap_or(0);
        let tagged = |keyword: &str| match &name {
            Some(name) => format!("{keyword} {name}"),
            None => format!("{keyword} {{...}}"),
        };

        let ty = match entry.tag() {
            gimli::DW_TAG_base_type => {
                let name = name.unwrap_or_default();
                match entry.attr_value(gimli::DW_AT_encoding)? {
                    Some(AttributeValue::Encoding(gimli::DW_ATE_float)) => {
                        Type::Float { name, size }
                    }
                    Some(AttributeValue::Encoding(
                        gimli::DW_ATE_signed | gimli::DW_ATE_signed_char,
                    )) => Type::Int {
                        name,
                        size,
                        signed: true,
                    },
                    _ => Type::Int {
                        name,
                        size,
                        signed: false,
                    },
                }
            }
            gimli::DW_TAG_enumeration_type => {
                // Signed when clang gives the enum a signed underlying type,
                // as it does when a value is negative.
                let underlying = self.type_attribute(&entry)?.map(|ty| &self.types[ty]);
                Type::Int {
                    name: tagged("enum"),
                    size,
                    signed: matches!(underlying, Some(Type::Int { signed: true, .. })),
                }
            }
            gimli::DW_TAG_pointer_type => {
                let to = self.type_attribute(&entry)?;
                Type::Pointer {
                    name: self.pointer_name(to),
                    to,
                }
            }
            gimli::DW_TAG_structure_type | gimli::DW_TAG_union_type => {
                let keyword = if entry.tag() == gimli::DW_TAG_union_type {
                    "union"
                } else {
                    "struct"
                };
                let name = tagged(keyword);
                let index = self.placeholder(offset, name.clone());
                // Its size is known now, for a typedef of it read while its
                // fields are (`typedef struct node Node` with `Node *next`).
                self.types[index] = Type::Struct {
                    name: name.clone(),
                    size,
                    fields: Vec::new(),
                };
                let mut fields = Vec::new();
                let mut tree = unit.entries_tree(Some(offset))?;
                let root = tree.root()?;
                let mut children = root.children();
                while let Some(child) = children.next()? {
                    let member = child.entry();
                    if member.tag() != gimli::DW_TAG_member {
                        continue;
                    }
                    let (Some(field), Some(ty)) = (
                        self.string(member, gimli::DW_AT_name)?,
                        self.type_attribute(member)?,
                    ) else {
                        continue;
                    };
                    let offset =
                        Self::number(member, gimli::DW_AT_data_member_location)?.unwrap_or(0);
                    let bits = match (
                        Self::number(member, gimli::DW_AT_data_bit_offset)?,
                        Self::number(member, gimli::DW_AT_bit_size)?,
                    ) {
                        (Some(first), Some(width)) => Some((first, width)),
                        _ => None,
                    };
                    fields.push(Field {
                        name: field,
                        ty,
                        offset,
                        bits,
                    });
                }
                self.types[index] = Type::Struct { name, size, fields };
                return Ok(index);
            }
            gimli::DW_TAG_array_type => {
                let Some(element) = self.type_attribute(&entry)? else {
                    return Ok(self.placeholder(offset, "void []".to_string()));
                };
                let mut counts = Vec::new();
                let mut tree = unit.entries_tree(Some(offset))?;
                let root = tree.root()?;
                let mut children = root.children();
                while let Some(child) = children.next()? {
                    let range = child.entry();
                    if range.tag() == gimli::DW_TAG_subrange_type {
                        let count = match Self::number(range, gimli::DW_AT_count)? {
                            Some(count) => count,
                            None => Self::number(range, gimli::DW_AT_upper_bound)?
                                .map_or(0, |bound| bound + 1),
                        };
                        counts.push(count);
                    }
                }
                // int a[2][3] is an array of 2 arrays of 3 ints.
                let mut inner = element;
                for &count in counts.iter().skip(1).rev() {
                    inner = self.add_array(inner, count);
                }
                let index = self.add_array(inner, counts.first().copied().unwrap_or(0));
                self.seen.insert(offset, index);
                return Ok(index);
            }
            gimli::DW_TAG_typedef => {
                let name = name.unwrap_or_default();
                let index = self.placeholder(offset, name.clone());
                let to = self.type_attribute(&entry)?;
                let size = to.map_or(0, |to| self.types[to].size());
                self.types[index] = Type::Alias {
                    name,
                    size,
                    to,
                    typedef: true,
                };
                return Ok(index);
            }
            gimli::DW_TAG_const_type | gimli::DW_TAG_volatile_type => {
                let qualifier = if entry.tag() == gimli::DW_TAG_const_type {
                    "const"
                } else {
                    "volatile"
                };
                let to = self.type_attribute(&entry)?;
                let target = self.name_of(to);
                let name = if target.ends_with('*') {
                    format!("{target} {qualifier}")
                } else {
                    format!("{qualifier} {target}")
                };
                Type::Alias {
                    name,
                    size: to.map_or(0, |to| self.types[to].size()),
                    to,
                    typedef: false,
                }
            }
            gimli::DW_TAG_subroutine_type => {
                let returns = self.type_attribute(&entry)?;
                let mut parameters = Vec::new();
                let mut tree = unit.entries_tree(Some(offset))?;
                let root = tree.root()?;
                let mut children = root.children();
                while let Some(child) = children.next()? {
                    if child.entry().tag() == gimli::DW_TAG_formal_parameter {
                        let ty = self.type_attribute(child.entry())?;
                        parameters.push(self.name_of(ty));
                    }
                }
                let parameters = if parameters.is_empty() {
                    "void".to_string()
                } else {
                    parameters.join(", ")
                };
                Type::Other {
                    name: format!("{} ({parameters})", self.name_of(returns)),
                }
            }
            _ => Type::Other {
                name: name.unwrap_or_else(|| "?".to_string()),
            },
        };
        self.types.push(ty);
        let index = self.types.len() - 1;
        self.seen.insert(offset, index);
        Ok(index)
    }

    /// GDB's name for a pointer: `struct node *`, `char **`, `int (*)(int)`.
    fn pointer_name(&self, to: Option<usize>) -> String {
        let target = self.name_of(to);
        // A pointer to a pointer to a function or an array: `int (**)[3]`.
        if target.contains("(*") {
            return target.replacen("(*", "(**", 1);
        }
        match to.map(|to| &self.types[to]) {
            // A function: `int (int)` becomes `int (*)(int)`.
            Some(Type::Other { name }) if name.contains(" (") => {
                return name.replacen(" (", " (*)(", 1);
            }
            // An array: `int [3]` becomes `int (*)[3]`, `char *[3]` `char *(*)[3]`.
            Some(Type::Array { name, .. }) => {
                let at = name.find('[').unwrap_or(name.len());
                let element = name[..at].trim_end();
                let space = if element.ends_with('*') { "" } else { " " };
                return format!("{element}{space}(*){}", &name[at..]);
            }
            _ => {}
        }
        if target.ends_with('*') {
            format!("{target}*")
        } else {
            format!("{target} *")
        }
    }

    /// GDB's name for an array: `int [3]`, `char *[3]`, `int [2][3]`.
    fn add_array(&mut self, of: usize, count: u64) -> usize {
        let element = &self.types[of];
        let element_name = element.name();
        let name = if matches!(element, Type::Array { .. }) {
            let at = element_name.find('[').unwrap_or(element_name.len());
            format!("{}[{count}]{}", &element_name[..at], &element_name[at..])
        } else if element_name.ends_with('*') {
            format!("{element_name}[{count}]")
        } else {
            format!("{element_name} [{count}]")
        };
        let size = element.size() * count;
        self.types.push(Type::Array {
            name,
            size,
            of,
            count,
        });
        self.types.len() - 1
    }
}

/// The `structs.debug` section: a JSON object the recorder reads (see
/// client/src/Services/debugger/wasm/recording.ts).
pub(crate) fn section_json(function_names: &[String], info: &DebugInfo) -> String {
    let mut out = String::from("{\"functions\":[");
    for (index, name) in function_names.iter().enumerate() {
        if index > 0 {
            out.push(',');
        }
        out.push_str(&json_string(name));
    }
    out.push_str("],\"statements\":[");
    for (index, statement) in info.statements.iter().enumerate() {
        if index > 0 {
            out.push(',');
        }
        let _ = write!(out, "{{\"line\":{},\"variables\":[", statement.line);
        for (index, variable) in statement.variables.iter().enumerate() {
            if index > 0 {
                out.push(',');
            }
            let _ = write!(
                out,
                "{{\"name\":{},\"type\":{},\"offset\":{}}}",
                json_string(&variable.name),
                variable.ty,
                variable.offset
            );
        }
        out.push_str("]}");
    }
    out.push_str("],\"types\":[");
    for (index, ty) in info.types.iter().enumerate() {
        if index > 0 {
            out.push(',');
        }
        out.push_str(&type_json(ty));
    }
    out.push_str("]}");
    out
}

fn optional(index: Option<usize>) -> String {
    index.map_or_else(|| "null".to_string(), |index| index.to_string())
}

fn type_json(ty: &Type) -> String {
    let name = json_string(ty.name());
    match ty {
        Type::Int { size, signed, .. } => {
            format!("{{\"kind\":\"int\",\"name\":{name},\"size\":{size},\"signed\":{signed}}}")
        }
        Type::Float { size, .. } => {
            format!("{{\"kind\":\"float\",\"name\":{name},\"size\":{size}}}")
        }
        Type::Pointer { to, .. } => format!(
            "{{\"kind\":\"pointer\",\"name\":{name},\"size\":{POINTER_SIZE},\"to\":{}}}",
            optional(*to)
        ),
        Type::Struct { size, fields, .. } => {
            let fields: Vec<String> = fields
                .iter()
                .map(|field| {
                    let bits = field.bits.map_or_else(String::new, |(first, width)| {
                        format!(",\"bitOffset\":{first},\"bitSize\":{width}")
                    });
                    format!(
                        "{{\"name\":{},\"type\":{},\"offset\":{}{bits}}}",
                        json_string(&field.name),
                        field.ty,
                        field.offset
                    )
                })
                .collect();
            format!(
                "{{\"kind\":\"struct\",\"name\":{name},\"size\":{size},\"fields\":[{}]}}",
                fields.join(",")
            )
        }
        Type::Array {
            size, of, count, ..
        } => format!(
            "{{\"kind\":\"array\",\"name\":{name},\"size\":{size},\"of\":{of},\"count\":{count}}}"
        ),
        Type::Alias {
            size, to, typedef, ..
        } => {
            let kind = if *typedef { "typedef" } else { "qualified" };
            format!(
                "{{\"kind\":\"{kind}\",\"name\":{name},\"size\":{size},\"to\":{}}}",
                optional(*to)
            )
        }
        Type::Other { .. } => format!("{{\"kind\":\"other\",\"name\":{name},\"size\":0}}"),
    }
}

pub(crate) fn json_string(string: &str) -> String {
    let mut out = String::from("\"");
    for character in string.chars() {
        match character {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            c if c.is_control() => {
                let _ = write!(out, "\\u{:04x}", c as u32);
            }
            c => out.push(c),
        }
    }
    out.push('"');
    out
}
