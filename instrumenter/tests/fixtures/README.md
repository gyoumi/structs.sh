# Test fixtures

Programs from `e2e/programs/`, compiled the way the browser compiles them:
`compileC()` in `client/src/Services/debugger/wasm/clang.ts`, which runs
the pinned `@yowasp/clang` with `-g -O0`. They include DWARF debug info.

To remake them after changing the compiler or its flags, compile each program
with `compileC()` (for example from a throwaway Vitest test) and write the
result here as `<name>.wasm`.
