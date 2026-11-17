//! Rewrites a student's program, compiled to wasm by clang in the browser,
//! so the debugger can record it as it runs.
//!
//! The browser loads this crate as `wasm32-unknown-unknown`. Only bytes cross
//! the boundary, so it needs no `wasm-bindgen`: see `ffi` below and
//! `client/src/Services/debugger/wasm/instrumenter.ts`.

/// Instruments a compiled program, returning the rewritten module.
///
/// For now (checkpoint 2a) the program passes through walrus unchanged.
pub fn instrument(wasm: &[u8]) -> Result<Vec<u8>, String> {
    let mut module = walrus::Module::from_buffer(wasm).map_err(|error| format!("{error:#}"))?;
    Ok(module.emit_wasm())
}

/// The functions the browser calls. A call goes:
///
/// 1. `alloc(len)` for the input, which the caller copies in.
/// 2. `instrument(ptr, len)`, which frees the input and returns 0 on success
///    or 1 on failure.
/// 3. `result_ptr()` and `result_len()` to read the output module, or the
///    error message as UTF-8.
/// 4. `free_result()` once the caller has copied it.
#[cfg(target_arch = "wasm32")]
mod ffi {
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
}
