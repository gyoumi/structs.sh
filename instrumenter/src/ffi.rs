use std::cell::RefCell;

thread_local! {
    static RESULT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

#[unsafe(no_mangle)]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    let mut buffer = Vec::<u8>::with_capacity(len);
    let pointer = buffer.as_mut_ptr();
    std::mem::forget(buffer);
    pointer
}

/// # Safety
/// `pointer` and `len` must come from one `alloc` call, filled by the
/// caller. The input is freed here.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn instrument(pointer: *mut u8, len: usize) -> u32 {
    let input = unsafe { Vec::from_raw_parts(pointer, len, len) };
    let (status, output) = match super::instrument(&input) {
        Ok(module) => (0, module),
        Err(message) => (1, message.into_bytes()),
    };
    RESULT.with(|result| *result.borrow_mut() = output);
    status
}

#[unsafe(no_mangle)]
pub extern "C" fn result_ptr() -> *const u8 {
    RESULT.with(|result| result.borrow().as_ptr())
}

#[unsafe(no_mangle)]
pub extern "C" fn result_len() -> usize {
    RESULT.with(|result| result.borrow().len())
}

#[unsafe(no_mangle)]
pub extern "C" fn free_result() {
    RESULT.with(|result| *result.borrow_mut() = Vec::new());
}
