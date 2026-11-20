//! The C types the debug info describes, as the `structs.debug` section
//! lists them.

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
    /// Its size is worked out once every type is read: see `size_of`.
    Array {
        name: String,
        of: usize,
        count: u64,
    },
    /// A typedef (no qualifier), or a type with `const` or `volatile`.
    Alias {
        name: String,
        to: Option<usize>,
        qualifier: Option<&'static str>,
    },
    /// A function, which the debugger doesn't read, but whose name pointers
    /// to it need.
    Function {
        name: String,
        returns: Option<usize>,
        /// `int, char *`, `void`, or with `...` for a variadic function.
        parameters: String,
    },
    /// Anything else the debugger doesn't read, such as a complex number.
    Other {
        name: String,
        size: u64,
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
pub(super) const POINTER_SIZE: u64 = 4;

impl Type {
    pub(super) fn name(&self) -> &str {
        match self {
            Type::Int { name, .. }
            | Type::Float { name, .. }
            | Type::Pointer { name, .. }
            | Type::Struct { name, .. }
            | Type::Array { name, .. }
            | Type::Alias { name, .. }
            | Type::Function { name, .. }
            | Type::Other { name, .. } => name,
        }
    }
}

/// A type's size in bytes, from the finished table: an alias or array's
/// size can't be known while a struct it refers to is still being read.
pub(super) fn size_of(types: &[Type], index: usize) -> u64 {
    match &types[index] {
        Type::Int { size, .. } | Type::Float { size, .. } | Type::Struct { size, .. } => *size,
        Type::Pointer { .. } => POINTER_SIZE,
        Type::Array { of, count, .. } => size_of(types, *of) * count,
        Type::Alias { to, .. } => to.map_or(0, |to| size_of(types, to)),
        Type::Function { .. } => 0,
        Type::Other { size, .. } => *size,
    }
}
