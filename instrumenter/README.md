# Instrumenter

Rewrites a student's program, after clang has compiled it to wasm in the
browser, so the wasm debugger can record it as it runs. Using the DWARF line
table, it adds calls at the start of each statement in the student's
functions, and when each function starts and returns. The C library has no
debug info, so it's left alone and stepping goes over it.

It also writes a `structs.debug` section describing each statement's line,
the variables in scope there and where they live, and their types, named the
way GDB names them (`src/debug.rs`).
`client/src/Services/debugger/wasm/recording.ts` turns the calls into the
steps a student sees, and `variables.ts` next to it reads each step's
variables from memory. `src/lib.rs` has the details.

It's Rust, using [walrus](https://crates.io/crates/walrus) to rewrite wasm.
The browser loads it as a plain `wasm32-unknown-unknown` module: only bytes
cross the boundary, so it needs no `wasm-bindgen`. `src/lib.rs` documents the
exports, and `client/src/Services/debugger/wasm/instrumenter.ts` calls them.

## Building

Install Rust with [rustup](https://rustup.rs). The version is pinned in
`rust-toolchain.toml` at the repo root, and rustup installs it on first use.
Then, from the repo root:

```sh
pnpm run instrumenter
```

This builds the `.wasm` and copies it to
`client/src/Services/debugger/wasm/generated/`, where the client loads it.
It isn't committed. Without it, the debugger reports that the instrumenter
couldn't be loaded, and the client's unit tests that use it fail.

CI and `client/Dockerfile.prod` build it the same way.

## Testing

```sh
cd instrumenter
cargo test                                   # tests/ uses programs compiled by clang
# Where the calls land is tested by running programs:
# client/src/Services/debugger/wasm/recording.test.ts
cargo fmt --check
cargo clippy --all-targets -- -D warnings
```

`tests/fixtures/` holds e2e programs compiled the way the browser compiles
them. See the README there for how to remake them.
