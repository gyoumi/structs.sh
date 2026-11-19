# Fixtures

`gdb-variables.json` is what the GDB debugger sent for `variables.c`:
`sendTypeDeclaration` events, then the states from 14 `executeNext` steps. It
was recorded from the `debugger` container over Socket.IO, and checked by
hand. Only the file name in `frame_info` was changed, from a temporary path.

GDB skips the first line of `main` (see `e2e/known-failures/gdb.json`), so its
first state is line 17, the wasm debugger's second step. Uninitialised
variables hold whatever was on the stack, where wasm memory starts zeroed.

`realloc_shrink.c` shrinks a block of four `struct node`s to one with
`realloc`, then mallocs a block of ints. wasm's malloc shrinks it in place
and puts the ints in the tail it gave back, over the old fourth node.
