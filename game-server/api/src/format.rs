//! Lays out ts-rs declarations the way the client's prettier config does.
//!
//! ts-rs prints each type on one line with commas. This rewrites each
//! declaration into prettier's layout (semicolons, a union of objects one
//! member per line) but keeps ts-rs's double-quoted string literals, which
//! the client's `singleQuote` setting would rewrite, so a declaration that
//! has any is marked `/* prettier-ignore */`. Comments inside a declaration
//! are dropped.

/// The directive that keeps prettier from requoting string literals.
const PRETTIER_IGNORE: &str = "/* prettier-ignore */";

/// Formats one ts-rs declaration (`type Name = ...;`) as an exported,
/// prettier-clean TypeScript type alias.
pub(crate) fn format_decl(decl: &str) -> String {
    let decl = strip_comments(decl);
    let decl = decl.trim().trim_end_matches(';');
    let decl = decl.strip_prefix("type ").unwrap_or(decl);
    let Some((name, body)) = decl.split_once('=') else {
        return format!("export type {};", decl.trim());
    };
    let members: Vec<Vec<String>> = split_top_level(body, '|')
        .iter()
        .map(|member| member.trim())
        .filter(|member| !member.is_empty())
        .map(format_member)
        .collect();
    let name = name.trim();
    let alias = match members.as_slice() {
        [single] => format!("export type {name} = {};", single.join("\n")),
        _ => {
            let union: Vec<String> = members
                .iter()
                .map(|lines| format!("  | {}", lines.join("\n    ")))
                .collect();
            format!("export type {name} =\n{};", union.join("\n"))
        }
    };
    if alias.contains('"') {
        format!("{PRETTIER_IGNORE}\n{alias}")
    } else {
        alias
    }
}

/// One union member as lines: an object type opens and closes on its own
/// lines, with one field per line between; anything else stays one line.
fn format_member(member: &str) -> Vec<String> {
    let Some(inner) = member
        .strip_prefix('{')
        .and_then(|rest| rest.strip_suffix('}'))
    else {
        return vec![member.to_owned()];
    };
    let mut lines = vec!["{".to_owned()];
    for field in split_top_level(inner, ',') {
        let field = field.trim();
        if field.is_empty() {
            continue;
        }
        lines.push(format!("  {};", format_field(field)));
    }
    lines.push("}".to_owned());
    lines
}

/// `"key": T` becomes `key: T`.
fn format_field(field: &str) -> String {
    match split_top_level(field, ':').as_slice() {
        [key, value @ ..] if !value.is_empty() => {
            let key = key.trim();
            let bare = key.trim_matches('"');
            let key = if is_identifier(bare) { bare } else { key };
            format!("{key}: {}", value.join(":").trim())
        }
        _ => field.to_owned(),
    }
}

/// Whether `key` can be written without quotes.
fn is_identifier(key: &str) -> bool {
    let mut chars = key.chars();
    chars
        .next()
        .is_some_and(|c| c.is_ascii_alphabetic() || c == '_' || c == '$')
        && chars.all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$')
}

/// Splits `text` at each `separator` that is outside brackets and strings.
fn split_top_level(text: &str, separator: char) -> Vec<String> {
    let mut parts = Vec::new();
    let mut current = String::new();
    let mut depth = 0_i32;
    let mut in_string = false;
    for c in text.chars() {
        match c {
            '"' => in_string = !in_string,
            '{' | '<' | '(' | '[' if !in_string => depth += 1,
            '}' | '>' | ')' | ']' if !in_string => depth -= 1,
            _ if c == separator && depth == 0 && !in_string => {
                parts.push(std::mem::take(&mut current));
                continue;
            }
            _ => {}
        }
        current.push(c);
    }
    parts.push(current);
    parts
}

/// Removes every `/* ... */` comment, including JSDoc.
fn strip_comments(text: &str) -> String {
    let mut out = String::new();
    let mut rest = text;
    while let Some(start) = rest.find("/*") {
        out.push_str(&rest[..start]);
        rest = rest[start..]
            .find("*/")
            .map_or("", |end| &rest[start + end + 2..]);
    }
    out.push_str(rest);
    out
}
