//! Reading a wasm request and checking which fields its template takes.

use crate::linked_list_index_drift::Operation;
use serde::Deserialize;

/// A request as sent, before its fields are checked against its template.
///
/// Each field but `template` is `None` when absent and `Some(None)` when
/// `null`, so a missing, null, or unexpected field is named in its error.
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(crate) struct Request {
    pub(crate) template: String,
    #[serde(default, deserialize_with = "present")]
    values: Option<Option<Vec<i32>>>,
    #[serde(default, deserialize_with = "present")]
    fixed: Option<Option<Vec<usize>>>,
    #[serde(default, deserialize_with = "present")]
    arrangement: Option<Option<Vec<i32>>>,
    #[serde(default, deserialize_with = "present")]
    target_passes: Option<Option<u32>>,
    #[serde(default, deserialize_with = "present")]
    target_tree: Option<Option<Vec<i32>>>,
    #[serde(default, deserialize_with = "present")]
    start: Option<Option<Vec<i32>>>,
    #[serde(default, deserialize_with = "present")]
    target: Option<Option<Vec<i32>>>,
    #[serde(default, deserialize_with = "present")]
    operations: Option<Option<Vec<Operation>>>,
}

/// A request for one of the array templates, with its fields checked.
pub(crate) struct ArrayRequest {
    pub(crate) template: String,
    pub(crate) values: Vec<i32>,
    fixed: Option<Option<Vec<usize>>>,
    pub(crate) arrangement: Vec<i32>,
    pub(crate) target_passes: Option<Option<u32>>,
    pub(crate) target_tree: Option<Option<Vec<i32>>>,
}

/// A `linked-list-index-drift` request, with its fields checked.
pub(crate) struct ListRequest {
    pub(crate) start: Vec<i32>,
    pub(crate) target: Vec<i32>,
    pub(crate) operations: Vec<Operation>,
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

fn reject<T>(field: &str, value: &Option<T>) -> Result<(), String> {
    match value {
        Some(_) => Err(unexpected(field)),
        None => Ok(()),
    }
}

fn required<T>(field: &str, value: Option<Option<T>>) -> Result<T, String> {
    match value {
        None => Err(format!(
            "The puzzle request could not be read: missing field `{field}`."
        )),
        Some(None) => Err(format!(
            "The puzzle request could not be read: `{field}` has to be a list, not null."
        )),
        Some(Some(value)) => Ok(value),
    }
}

impl Request {
    /// Checks the fields of an array template's request: `values` and
    /// `arrangement` are required, and the linked-list fields are rejected.
    pub(crate) fn into_array(self) -> Result<ArrayRequest, String> {
        reject("start", &self.start)?;
        reject("target", &self.target)?;
        reject("operations", &self.operations)?;
        Ok(ArrayRequest {
            values: required("values", self.values)?,
            arrangement: required("arrangement", self.arrangement)?,
            template: self.template,
            fixed: self.fixed,
            target_passes: self.target_passes,
            target_tree: self.target_tree,
        })
    }

    /// Checks the fields of a `linked-list-index-drift` request: `start`,
    /// `target`, and `operations` are required, and the array fields are
    /// rejected.
    pub(crate) fn into_list(self) -> Result<ListRequest, String> {
        reject("values", &self.values)?;
        reject("fixed", &self.fixed)?;
        reject("arrangement", &self.arrangement)?;
        reject("targetPasses", &self.target_passes)?;
        reject("targetTree", &self.target_tree)?;
        Ok(ListRequest {
            start: required("start", self.start)?,
            target: required("target", self.target)?,
            operations: required("operations", self.operations)?,
        })
    }
}

impl ArrayRequest {
    /// Rejects `targetPasses` unless the template is `bubble-exact-passes`.
    pub(crate) fn reject_target_passes(&self) -> Result<(), String> {
        reject("targetPasses", &self.target_passes)
    }

    /// Rejects `targetTree` unless the template is `bst-forced-order`.
    pub(crate) fn reject_target_tree(&self) -> Result<(), String> {
        reject("targetTree", &self.target_tree)
    }

    /// The fixed slots of a template that needs them, checked against
    /// `values`.
    pub(crate) fn required_fixed(&self) -> Result<Vec<usize>, String> {
        let fixed = required("fixed", self.fixed.clone())?;
        self.check_fixed(&fixed)?;
        Ok(fixed)
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
