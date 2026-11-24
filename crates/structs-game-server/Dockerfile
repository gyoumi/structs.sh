# The daily game's HTTP server. Build from the repo root, because the
# toolchain file and the Cargo workspace live there:
#   docker build -f crates/structs-game-server/Dockerfile .

# ===== Stage 1: Building the server =====
FROM rust:1.99-slim AS builder
WORKDIR /app
ENV SQLX_OFFLINE=true
COPY rust-toolchain.toml ./
RUN rustup toolchain install

# Build the dependencies against stub sources first, so this layer stays
# cached until a Cargo.toml or Cargo.lock changes.
COPY crates/Cargo.toml crates/Cargo.lock crates/
COPY crates/structs-puzzles/Cargo.toml crates/structs-puzzles/
COPY crates/structs-game-db/Cargo.toml crates/structs-game-db/
COPY crates/structs-game-api/Cargo.toml crates/structs-game-api/
COPY crates/structs-game-server/Cargo.toml crates/structs-game-server/
RUN for crate in structs-puzzles structs-game-db structs-game-api structs-game-server; do \
      mkdir -p crates/$crate/src && touch crates/$crate/src/lib.rs; \
    done \
 && echo 'fn main() {}' > crates/structs-game-server/src/main.rs \
 && cargo build --release --locked --manifest-path crates/Cargo.toml -p structs-game-server

# Then the real sources. Touching them makes Cargo rebuild the workspace
# crates instead of trusting the stubs' newer timestamps.
COPY crates crates
RUN find crates/structs-puzzles/src crates/structs-game-db/src crates/structs-game-api/src \
      crates/structs-game-server/src -name '*.rs' -exec touch {} + \
 && cargo build --release --locked --manifest-path crates/Cargo.toml -p structs-game-server

# ===== Stage 2: Running the server =====
FROM debian:bookworm-slim AS runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --no-create-home --shell /usr/sbin/nologin structs
COPY --from=builder /app/crates/target/release/structs-game-server /usr/local/bin/structs-game-server
USER structs
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/structs-game-server"]
