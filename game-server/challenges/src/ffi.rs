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
/// caller. The request is freed here.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn score(pointer: *mut u8, len: usize) -> u32 {
    let request = unsafe { Vec::from_raw_parts(pointer, len, len) };
    respond(super::wire::score_request(&request))
}

/// # Safety
/// `pointer` and `len` must come from one `alloc` call, filled by the
/// caller. The request is freed here.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn step_log(pointer: *mut u8, len: usize) -> u32 {
    let request = unsafe { Vec::from_raw_parts(pointer, len, len) };
    respond(super::wire::step_log_request(&request))
}

fn respond(reply: Result<String, String>) -> u32 {
    let (status, output) = match reply {
        Ok(reply) => (0, reply),
        Err(message) => (1, message),
    };
    RESULT.with(|result| *result.borrow_mut() = output.into_bytes());
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
