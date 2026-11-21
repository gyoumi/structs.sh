use super::UnitReader;
use super::types::Type;

impl UnitReader<'_, '_> {
    /// A type's name, as the client's visualiser and variable panel match
    /// and show it, spelled like the names recorded in
    /// `client/src/Services/debugger/wasm/fixtures/gdb-variables.json`
    /// (`int [3]`, `char *`, `Node *`), and built the way C declarators nest:
    /// `inner` is what's already been wrapped around it, so a pointer to an
    /// array of 3 ints is `int (*)[3]` and an array of 2 of those is
    /// `int (*[2])[3]`.
    pub(super) fn format_declarator(&self, ty: Option<usize>, inner: &str) -> String {
        match ty.map(|ty| &self.types[ty]) {
            Some(Type::Pointer { to, .. }) => self.format_pointer_declarator(*to, inner),
            Some(Type::Array { of, count, .. }) => {
                self.format_declarator(Some(*of), &format!("{inner}[{count}]"))
            }
            Some(Type::Function {
                returns,
                parameters,
                ..
            }) => self.format_declarator(*returns, &format!("{inner}({parameters})")),
            Some(Type::Qualified { .. }) => {
                let mut qualifiers = Vec::new();
                let mut target = ty;
                while let Some(Type::Qualified { qualifier, to, .. }) =
                    target.map(|ty| &self.types[ty])
                {
                    qualifiers.push(*qualifier);
                    target = *to;
                }
                let qualifiers = const_first(qualifiers).join(" ");
                match target.map(|ty| &self.types[ty]) {
                    Some(Type::Pointer { to, .. }) => {
                        self.format_qualified_pointer_declarator(*to, &qualifiers, inner)
                    }
                    _ => {
                        let base = format!("{qualifiers} {}", self.format_declarator(target, ""));
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

    pub(super) fn format_pointer_declarator(&self, to: Option<usize>, inner: &str) -> String {
        self.format_qualified_pointer_declarator(to, "", inner)
    }

    fn format_qualified_pointer_declarator(
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
            self.format_declarator(to, &format!("({star})"))
        } else {
            self.format_declarator(to, &star)
        }
    }
}

fn const_first(mut qualifiers: Vec<&'static str>) -> Vec<&'static str> {
    qualifiers.sort_by_key(|qualifier| *qualifier != "const");
    qualifiers
}
