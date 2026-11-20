//! Writes what was read as the `structs.debug` section's JSON.

use std::fmt::Write;

use super::DebugInfo;
use super::types::{POINTER_SIZE, Type, size_of};

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
    for index in 0..info.types.len() {
        if index > 0 {
            out.push(',');
        }
        out.push_str(&type_json(&info.types, index));
    }
    out.push_str("]}");
    out
}

fn optional(index: Option<usize>) -> String {
    index.map_or_else(|| "null".to_string(), |index| index.to_string())
}

fn type_json(types: &[Type], index: usize) -> String {
    let ty = &types[index];
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
        Type::Array { of, count, .. } => {
            let size = size_of(types, index);
            format!(
                "{{\"kind\":\"array\",\"name\":{name},\"size\":{size},\"of\":{of},\"count\":{count}}}"
            )
        }
        Type::Alias { to, qualifier, .. } => {
            let kind = if qualifier.is_some() {
                "qualified"
            } else {
                "typedef"
            };
            let size = size_of(types, index);
            format!(
                "{{\"kind\":\"{kind}\",\"name\":{name},\"size\":{size},\"to\":{}}}",
                optional(*to)
            )
        }
        Type::Function { .. } | Type::Other { .. } => {
            let size = size_of(types, index);
            format!("{{\"kind\":\"other\",\"name\":{name},\"size\":{size}}}")
        }
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
