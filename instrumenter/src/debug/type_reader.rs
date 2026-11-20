//! Reads the types of the student's variables into the type table.

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

    /// Adds a type now, before its parts, so a type that refers back to
    /// itself (`struct node *next`) finds it. `fill` then replaces it.
    fn placeholder(&mut self, offset: UnitOffset, name: String) -> usize {
        self.types.push(Type::Other { name, size: 0 });
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
            gimli::DW_TAG_base_type => Self::base_type(&entry, name.unwrap_or_default(), size)?,
            gimli::DW_TAG_enumeration_type => self.enumeration(&entry, tagged("enum"), size)?,
            gimli::DW_TAG_pointer_type => {
                let to = self.type_attribute(&entry)?;
                Type::Pointer {
                    name: self.declare_pointer(to, ""),
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
        self.types.push(ty);
        let index = self.types.len() - 1;
        self.seen.insert(offset, index);
        Ok(index)
    }

    fn base_type(entry: &Entry, name: String, size: u64) -> gimli::Result<Type> {
        Ok(match entry.attr_value(gimli::DW_AT_encoding)? {
            Some(AttributeValue::Encoding(gimli::DW_ATE_float)) => Type::Float { name, size },
            // `double _Complex` and the like: not read, but sized.
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
        // Signed when clang gives the enum a signed underlying type,
        // as it does when a value is negative.
        let underlying = self.type_attribute(entry)?.map(|ty| &self.types[ty]);
        Ok(Type::Int {
            name,
            size,
            signed: matches!(underlying, Some(Type::Int { signed: true, .. })),
        })
    }

    fn add_struct(&mut self, offset: UnitOffset, name: String, size: u64) -> gimli::Result<usize> {
        let index = self.placeholder(offset, name.clone());
        // Its size is known now, for a typedef of it read while its
        // fields are (`typedef struct node Node` with `Node *next`).
        self.types[index] = Type::Struct {
            name: name.clone(),
            size,
            fields: Vec::new(),
        };
        let fields = self.fields(offset)?;
        self.types[index] = Type::Struct { name, size, fields };
        Ok(index)
    }

    fn add_array_type(&mut self, offset: UnitOffset, entry: &Entry) -> gimli::Result<usize> {
        let Some(element) = self.type_attribute(entry)? else {
            return Ok(self.placeholder(offset, "void []".to_string()));
        };
        let counts = self.subrange_counts(offset)?;
        // int a[2][3] is an array of 2 arrays of 3 ints.
        let mut inner = element;
        for &count in counts.iter().skip(1).rev() {
            inner = self.add_array(inner, count);
        }
        let index = self.add_array(inner, counts.first().copied().unwrap_or(0));
        self.seen.insert(offset, index);
        Ok(index)
    }

    /// The length of each dimension of the array at `offset`, outermost first.
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

    /// Adds an array of `count` of type `of`.
    fn add_array(&mut self, of: usize, count: u64) -> usize {
        let name = self.declare(Some(of), &format!("[{count}]"));
        self.types.push(Type::Array { name, of, count });
        self.types.len() - 1
    }

    fn add_typedef(
        &mut self,
        offset: UnitOffset,
        entry: &Entry,
        name: String,
    ) -> gimli::Result<usize> {
        let index = self.placeholder(offset, name.clone());
        let to = self.type_attribute(entry)?;
        self.types[index] = Type::Alias {
            name,
            to,
            qualifier: None,
        };
        Ok(index)
    }

    fn add_qualified(&mut self, offset: UnitOffset, entry: &Entry) -> gimli::Result<usize> {
        let qualifier = match entry.tag() {
            gimli::DW_TAG_const_type => "const",
            gimli::DW_TAG_volatile_type => "volatile",
            _ => "restrict",
        };
        let to = self.type_attribute(entry)?;
        self.types.push(Type::Alias {
            name: String::new(),
            to,
            qualifier: Some(qualifier),
        });
        let index = self.types.len() - 1;
        let name = self.declare(Some(index), "");
        if let Type::Alias { name: slot, .. } = &mut self.types[index] {
            *slot = name;
        }
        self.seen.insert(offset, index);
        Ok(index)
    }

    fn function_type(&mut self, offset: UnitOffset, entry: &Entry) -> gimli::Result<Type> {
        let returns = self.type_attribute(entry)?;
        let parameters = self.parameters(offset)?;
        Ok(Type::Function {
            name: self.declare(returns, &format!("({parameters})")),
            returns,
            parameters,
        })
    }

    /// The parameter list of the function type at `offset`: `int, char *`,
    /// `void`, or with `...` for a variadic function.
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
