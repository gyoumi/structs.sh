# Fixtures

`gdb-variables.json` is what the GDB debugger sent for `variables.c`:
`sendTypeDeclaration` events, then the states from 14 `executeNext` steps. It
was recorded from the `debugger` container over Socket.IO, and checked by
hand. Only the file name in `frame_info` was changed, from a temporary path.

GDB skips the first line of `main` (see `e2e/known-failures/gdb.json`), so its
first state is line 17, the wasm debugger's second step. Uninitialised
variables hold whatever was on the stack, where wasm memory starts zeroed.
