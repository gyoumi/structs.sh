//! Names types the way GDB does, following how C declarators nest.

use super::UnitReader;
use super::types::Type;

impl UnitReader<'_, '_> {
    /// GDB's name for a type, built the way C declarators nest: `inner` is
    /// what's already been wrapped around it, so a pointer to an array of 3
    /// ints is `int (*)[3]` and an array of 2 of those is `int (*[2])[3]`.
    pub(super) fn declare(&self, ty: Option<usize>, inner: &str) -> String {
        match ty.map(|ty| &self.types[ty]) {
            Some(Type::Pointer { to, .. }) => self.declare_pointer(*to, inner),
            Some(Type::Array { of, count, .. }) => {
                self.declare(Some(*of), &format!("{inner}[{count}]"))
            }
            Some(Type::Function {
                returns,
                parameters,
                ..
            }) => self.declare(*returns, &format!("{inner}({parameters})")),
            Some(Type::Alias {
                qualifier: Some(_), ..
            }) => {
                // The qualifiers down to the type they qualify, in GDB's order.
                let mut qualifiers = Vec::new();
                let mut target = ty;
                while let Some(Type::Alias {
                    qualifier: Some(qualifier),
                    to,
                    ..
                }) = target.map(|ty| &self.types[ty])
                {
                    qualifiers.push(*qualifier);
                    target = *to;
                }
                qualifiers.sort_by_key(|qualifier| *qualifier != "const");
                let qualifiers = qualifiers.join(" ");
                match target.map(|ty| &self.types[ty]) {
                    // A qualified pointer: `char * const`, `int (* const)(int)`.
                    Some(Type::Pointer { to, .. }) => {
                        self.declare_qualified_pointer(*to, &qualifiers, inner)
                    }
                    _ => {
                        let base = format!("{qualifiers} {}", self.declare(target, ""));
                        if inner.is_empty() {
                            base
                        } else {
                            format!("{base} {inner}")
                        }
                    }
                }
            }
            other => {
                let base = other.map_or("void", Type::name);
                if inner.is_empty() {
                    base.to_string()
                } else {
                    format!("{base} {inner}")
                }
            }
        }
    }

    /// A pointer to `to` inside `inner`: `struct node *`, `char **`, and
    /// `int (*)(int)` where the pointer needs brackets.
    pub(super) fn declare_pointer(&self, to: Option<usize>, inner: &str) -> String {
        self.declare_qualified_pointer(to, "", inner)
    }

    /// A pointer with `qualifiers` (`const`, `volatile`, or none).
    fn declare_qualified_pointer(
        &self,
        to: Option<usize>,
        qualifiers: &str,
        inner: &str,
    ) -> String {
        let star = if qualifiers.is_empty() {
            format!("*{inner}")
        } else if inner.is_empty() {
            format!("* {qualifiers}")
        } else {
            format!("* {qualifiers} {inner}")
        };
        let target = to.map(|to| &self.types[to]);
        if matches!(target, Some(Type::Array { .. } | Type::Function { .. })) {
            self.declare(to, &format!("({star})"))
        } else {
            self.declare(to, &star)
        }
    }
}
