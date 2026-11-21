use std::ops::Range;

use gimli::{AttributeValue, EndianSlice, LittleEndian};

use super::{Entry, FrameBase, Function, UnitReader, Variable};

pub(super) struct Scope {
    ranges: Vec<Range<u64>>,
    depth: usize,
    variables: Vec<Variable>,
}

/// The variables in scope at `address`: innermost scope first, and in the
/// order they're declared within each scope. The client keeps the first
/// variable of each name, so an inner one hides an outer one, and builds its
/// variable list in this order, the order recorded in
/// `client/src/Services/debugger/wasm/fixtures/gdb-variables.json`
/// (`i,xs,n,total` inside `sum`'s loop).
pub(super) fn visible(scopes: &[Scope], address: u64) -> Vec<Variable> {
    let mut open: Vec<&Scope> = scopes
        .iter()
        .filter(|scope| scope.ranges.iter().any(|r| r.contains(&address)))
        .collect();
    open.sort_by_key(|scope| std::cmp::Reverse(scope.depth));
    open.into_iter()
        .flat_map(|scope| scope.variables.iter().cloned())
        .collect()
}

impl<'a> UnitReader<'a, '_> {
    /// A function, and its scopes, its own outermost one included.
    pub(super) fn function(
        &mut self,
        node: gimli::EntriesTreeNode<EndianSlice<'a, LittleEndian>>,
        code_start: u32,
    ) -> gimli::Result<Option<(Function, Vec<Scope>)>> {
        let entry = node.entry();
        let Some(name) = self.string(entry, gimli::DW_AT_name)? else {
            return Ok(None);
        };
        let ranges = self.ranges(entry)?;
        if ranges.is_empty() {
            return Ok(None);
        }
        let frame_base = self.frame_base(entry)?;
        let function = Function {
            ranges: ranges
                .iter()
                .map(|r| code_start + r.start as u32..code_start + r.end as u32)
                .collect(),
            name,
            frame_base,
        };
        let mut scopes = vec![Scope {
            ranges,
            depth: 0,
            variables: Vec::new(),
        }];
        self.scope(node, 0, &mut scopes)?;
        Ok(Some((function, scopes)))
    }

    fn frame_base(&self, entry: &Entry) -> gimli::Result<Option<FrameBase>> {
        Ok(match entry.attr_value(gimli::DW_AT_frame_base)? {
            Some(AttributeValue::Exprloc(expression)) => {
                match expression.operations(self.unit.encoding()).next()? {
                    Some(gimli::Operation::WasmLocal { index }) => Some(FrameBase::Local(index)),
                    Some(gimli::Operation::WasmGlobal { index }) => Some(FrameBase::Global(index)),
                    _ => None,
                }
            }
            _ => None,
        })
    }

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
                    if let Some(variable) = self.frame_variable(entry)? {
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

    fn frame_variable(&mut self, entry: &Entry) -> gimli::Result<Option<Variable>> {
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
}
