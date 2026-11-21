use gimli::UnitOffset;

use super::UnitReader;
use super::types::{Field, Type};

impl UnitReader<'_, '_> {
    pub(super) fn fields(&mut self, offset: UnitOffset) -> gimli::Result<Vec<Field>> {
        let unit = self.unit;
        let mut fields = Vec::new();
        let mut tree = unit.entries_tree(Some(offset))?;
        let root = tree.root()?;
        let mut children = root.children();
        while let Some(child) = children.next()? {
            let member = child.entry();
            if member.tag() != gimli::DW_TAG_member {
                continue;
            }
            let Some(ty) = self.type_attribute(member)? else {
                continue;
            };
            let offset = Self::number(member, gimli::DW_AT_data_member_location)?.unwrap_or(0);
            let Some(field) = self.string(member, gimli::DW_AT_name)? else {
                // An anonymous struct or union: its fields are the
                // outer struct's, as C11 lets them be used.
                fields.extend(self.lifted_fields(ty, offset));
                continue;
            };
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
        Ok(fields)
    }

    fn lifted_fields(&self, ty: usize, offset: u64) -> Vec<Field> {
        let Type::Struct { fields: inner, .. } = &self.types[ty] else {
            return Vec::new();
        };
        inner
            .iter()
            .map(|field| Field {
                name: field.name.clone(),
                ty: field.ty,
                offset: offset + field.offset,
                bits: field.bits.map(|(first, width)| (first + offset * 8, width)),
            })
            .collect()
    }
}
