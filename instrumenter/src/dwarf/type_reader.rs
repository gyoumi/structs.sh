use gimli::{AttributeValue, UnitOffset};

use super::types::Type;
use super::{Entry, UnitReader};

impl UnitReader<'_, '_> {
    /// The type an entry's `DW_AT_type` names, or None for `void`.
    pub(super) fn type_attribute(&mut self, entry: &Entry) -> gimli::Result<Option<usize>> {
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

    fn record_type(&mut self, offset: UnitOffset, ty: Type) -> usize {
        self.types.push(ty);
        let index = self.types.len() - 1;
        self.types_by_offset.insert(offset, index);
        index
    }

    fn reserve_slot_for_recursive_type(&mut self, offset: UnitOffset, name: String) -> usize {
        self.record_type(offset, Type::Other { name, size: 0 })
    }

    fn type_at(&mut self, offset: UnitOffset) -> gimli::Result<usize> {
        if let Some(&index) = self.types_by_offset.get(&offset) {
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
            gimli::DW_TAG_base_type => Self::base_type(&entry, name.unwrap_or_default(), size)?,
            gimli::DW_TAG_enumeration_type => self.enumeration(&entry, tagged("enum"), size)?,
            gimli::DW_TAG_pointer_type => {
                let to = self.type_attribute(&entry)?;
                Type::Pointer {
                    name: self.format_pointer_declarator(to, ""),
                    to,
                }
            }
            gimli::DW_TAG_structure_type | gimli::DW_TAG_union_type => {
                let keyword = if entry.tag() == gimli::DW_TAG_union_type {
                    "union"
                } else {
                    "struct"
                };
                return self.add_struct(offset, tagged(keyword), size);
            }
            gimli::DW_TAG_array_type => return self.add_array_type(offset, &entry),
            gimli::DW_TAG_typedef => {
                return self.add_typedef(offset, &entry, name.unwrap_or_default());
            }
            gimli::DW_TAG_const_type
            | gimli::DW_TAG_volatile_type
            | gimli::DW_TAG_restrict_type => return self.add_qualified(offset, &entry),
            gimli::DW_TAG_subroutine_type => self.function_type(offset, &entry)?,
            _ => Type::Other {
                name: name.unwrap_or_else(|| "?".to_string()),
                size,
            },
        };
        Ok(self.record_type(offset, ty))
    }

    fn base_type(entry: &Entry, name: String, size: u64) -> gimli::Result<Type> {
        Ok(match entry.attr_value(gimli::DW_AT_encoding)? {
            Some(AttributeValue::Encoding(gimli::DW_ATE_float)) => Type::Float { name, size },
            Some(AttributeValue::Encoding(
                gimli::DW_ATE_complex_float | gimli::DW_ATE_imaginary_float,
            )) => Type::Other { name, size },
            Some(AttributeValue::Encoding(gimli::DW_ATE_signed | gimli::DW_ATE_signed_char)) => {
                Type::Int {
                    name,
                    size,
                    signed: true,
                }
            }
            _ => Type::Int {
                name,
                size,
                signed: false,
            },
        })
    }

    fn enumeration(&mut self, entry: &Entry, name: String, size: u64) -> gimli::Result<Type> {
        let underlying = self.type_attribute(entry)?.map(|ty| &self.types[ty]);
        Ok(Type::Int {
            name,
            size,
            signed: matches!(underlying, Some(Type::Int { signed: true, .. })),
        })
    }

    fn add_struct(&mut self, offset: UnitOffset, name: String, size: u64) -> gimli::Result<usize> {
        let index = self.reserve_slot_for_recursive_type(offset, name.clone());
        let fields = self.fields(offset)?;
        self.types[index] = Type::Struct { name, size, fields };
        Ok(index)
    }

    fn add_array_type(&mut self, offset: UnitOffset, entry: &Entry) -> gimli::Result<usize> {
        let Some(element) = self.type_attribute(entry)? else {
            let void_array = Type::Other {
                name: "void []".to_string(),
                size: 0,
            };
            return Ok(self.record_type(offset, void_array));
        };
        let counts = self.subrange_counts(offset)?;
        // int a[2][3] is an array of 2 arrays of 3 ints.
        let mut inner = element;
        for &count in counts.iter().skip(1).rev() {
            inner = self.push_array_dimension(inner, count);
        }
        let index = self.push_array_dimension(inner, counts.first().copied().unwrap_or(0));
        self.types_by_offset.insert(offset, index);
        Ok(index)
    }

    fn subrange_counts(&self, offset: UnitOffset) -> gimli::Result<Vec<u64>> {
        let mut counts = Vec::new();
        let mut tree = self.unit.entries_tree(Some(offset))?;
        let root = tree.root()?;
        let mut children = root.children();
        while let Some(child) = children.next()? {
            let range = child.entry();
            if range.tag() == gimli::DW_TAG_subrange_type {
                let count = match Self::number(range, gimli::DW_AT_count)? {
                    Some(count) => count,
                    None => {
                        Self::number(range, gimli::DW_AT_upper_bound)?.map_or(0, |bound| bound + 1)
                    }
                };
                counts.push(count);
            }
        }
        Ok(counts)
    }

    fn push_array_dimension(&mut self, of: usize, count: u64) -> usize {
        let name = self.format_declarator(Some(of), &format!("[{count}]"));
        self.types.push(Type::Array { name, of, count });
        self.types.len() - 1
    }

    fn add_typedef(
        &mut self,
        offset: UnitOffset,
        entry: &Entry,
        name: String,
    ) -> gimli::Result<usize> {
        let index = self.reserve_slot_for_recursive_type(offset, name.clone());
        let to = self.type_attribute(entry)?;
        self.types[index] = Type::Typedef { name, to };
        Ok(index)
    }

    fn add_qualified(&mut self, offset: UnitOffset, entry: &Entry) -> gimli::Result<usize> {
        let qualifier = match entry.tag() {
            gimli::DW_TAG_const_type => "const",
            gimli::DW_TAG_volatile_type => "volatile",
            _ => "restrict",
        };
        let to = self.type_attribute(entry)?;
        self.types.push(Type::Qualified {
            name: String::new(),
            to,
            qualifier,
        });
        let index = self.types.len() - 1;
        let name = self.format_declarator(Some(index), "");
        if let Type::Qualified { name: slot, .. } = &mut self.types[index] {
            *slot = name;
        }
        self.types_by_offset.insert(offset, index);
        Ok(index)
    }

    fn function_type(&mut self, offset: UnitOffset, entry: &Entry) -> gimli::Result<Type> {
        let returns = self.type_attribute(entry)?;
        let parameters = self.parameters(offset)?;
        Ok(Type::Function {
            name: self.format_declarator(returns, &format!("({parameters})")),
            returns,
            parameters,
        })
    }

    fn parameters(&mut self, offset: UnitOffset) -> gimli::Result<String> {
        let unit = self.unit;
        let mut parameters = Vec::new();
        let mut tree = unit.entries_tree(Some(offset))?;
        let root = tree.root()?;
        let mut children = root.children();
        while let Some(child) = children.next()? {
            match child.entry().tag() {
                gimli::DW_TAG_formal_parameter => {
                    let ty = self.type_attribute(child.entry())?;
                    parameters.push(self.name_of(ty));
                }
                gimli::DW_TAG_unspecified_parameters => parameters.push("...".to_string()),
                _ => {}
            }
        }
        Ok(if parameters.is_empty() {
            "void".to_string()
        } else {
            parameters.join(", ")
        })
    }
}
