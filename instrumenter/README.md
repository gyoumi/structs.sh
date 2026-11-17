# Instrumenter

Rewrites a student's program, after clang has compiled it to wasm in the
browser, so the wasm debugger can record it as it runs. For now (checkpoint
2a in `docs/debugger-rewrite.md`) it passes programs through unchanged.

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
It isn't committed. Without it, the GDB debugger still works, but the wasm
debugger reports that the instrumenter couldn't be loaded, and the client's
unit tests that use it fail.

CI and `client/Dockerfile.prod` build it the same way.

## Testing

```sh
cd instrumenter
cargo test                                   # tests/ uses programs compiled by clang
cargo fmt --check
cargo clippy --all-targets -- -D warnings
```

`tests/fixtures/` holds e2e programs compiled the way the browser compiles
them. See the README there for how to remake them.
