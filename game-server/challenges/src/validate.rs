use crate::InputError;

/// Checks `input` against an instance's `values` and `fixed` slots, in
/// [`InputError`] order.
pub(crate) fn validate(values: &[i32], fixed: &[usize], input: &[i32]) -> Result<(), InputError> {
    if let Some(index) = fixed
        .iter()
        .copied()
        .filter(|&index| index >= values.len())
        .min()
    {
        return Err(InputError::FixedSlotOutOfRange { index });
    }
    if input.len() != values.len() {
        return Err(InputError::WrongLength {
            expected: values.len(),
            got: input.len(),
        });
    }
    if let Some(index) = fixed
        .iter()
        .copied()
        .filter(|&index| input[index] != values[index])
        .min()
    {
        return Err(InputError::FixedValueMoved { index });
    }
    let mut got = input.to_vec();
    let mut want = values.to_vec();
    got.sort_unstable();
    want.sort_unstable();
    if got != want {
        return Err(InputError::NotAPermutation);
    }
    Ok(())
}

/// Converts a count to `u32`, saturating at `u32::MAX`.
pub(crate) fn count(steps: usize) -> u32 {
    u32::try_from(steps).unwrap_or(u32::MAX)
}
