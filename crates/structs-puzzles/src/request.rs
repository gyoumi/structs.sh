//! Reading a wasm request and checking which optional fields its template
//! takes.

use serde::Deserialize;

/// A request as sent, before its fields are checked against its template.
///
/// Each optional field is `None` when absent and `Some(None)` when `null`,
/// so an explicit `null` can be rejected like any other unexpected value.
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(crate) struct Request {
    pub(crate) template: String,
    pub(crate) values: Vec<i32>,
    #[serde(default, deserialize_with = "present")]
    pub(crate) fixed: Option<Option<Vec<usize>>>,
    pub(crate) arrangement: Vec<i32>,
    #[serde(default, deserialize_with = "present")]
    pub(crate) target_passes: Option<Option<u32>>,
    #[serde(default, deserialize_with = "present")]
    pub(crate) target_tree: Option<Option<Vec<i32>>>,
}

fn present<'de, D, T>(deserializer: D) -> Result<Option<T>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    T::deserialize(deserializer).map(Some)
}

fn unexpected(field: &str) -> String {
    format!("The puzzle request could not be read: unexpected field `{field}`.")
}

impl Request {
    /// Rejects `targetPasses` unless the template is `bubble-exact-passes`.
    pub(crate) fn reject_target_passes(&self) -> Result<(), String> {
        match self.target_passes {
            Some(_) => Err(unexpected("targetPasses")),
            None => Ok(()),
        }
    }

    /// Rejects `targetTree` unless the template is `bst-forced-order`.
    pub(crate) fn reject_target_tree(&self) -> Result<(), String> {
        match self.target_tree {
            Some(_) => Err(unexpected("targetTree")),
            None => Ok(()),
        }
    }

    /// The fixed slots of a template that needs them, checked against
    /// `values`.
    pub(crate) fn required_fixed(&self) -> Result<Vec<usize>, String> {
        match &self.fixed {
            None => Err("The puzzle request could not be read: missing field `fixed`.".to_owned()),
            Some(None) => Err(
                "The puzzle request could not be read: `fixed` has to be a list, not null."
                    .to_owned(),
            ),
            Some(Some(fixed)) => {
                self.check_fixed(fixed)?;
                Ok(fixed.clone())
            }
        }
    }

    /// Accepts a missing or empty `fixed`, for a template with no fixed
    /// slots.
    pub(crate) fn no_fixed(&self, template: &str) -> Result<(), String> {
        match &self.fixed {
            None => Ok(()),
            Some(Some(fixed)) if fixed.is_empty() => Ok(()),
            Some(_) => Err(format!(
                "The puzzle is broken: a {template} puzzle has no fixed slots, so `fixed` has to \
                 be left out or empty."
            )),
        }
    }

    fn check_fixed(&self, fixed: &[usize]) -> Result<(), String> {
        match fixed.iter().find(|&&index| index >= self.values.len()) {
            Some(&index) => Err(format!(
                "The puzzle is broken: fixed slot {} is past its last value.",
                index as u128 + 1
            )),
            None => Ok(()),
        }
    }
}
