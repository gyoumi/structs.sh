# The daily game's HTTP server, and the `seed-daily` fixture seeder. Build
# from the repo root, because the toolchain file and the Cargo workspace live
# there:
#   docker build -f crates/structs-game-server/Dockerfile .
#   docker build -f crates/structs-game-server/Dockerfile --target seed-runtime .

# ===== Stage 1: Building the server =====
FROM rust:1.99-slim-bookworm AS builder
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
 && mkdir -p crates/structs-game-db/src/bin \
 && echo 'fn main() {}' > crates/structs-game-db/src/bin/seed-daily.rs \
 && cargo build --release --locked --manifest-path crates/Cargo.toml \
      -p structs-game-server -p structs-game-db --bin structs-game-server --bin seed-daily

# Then the real sources. Touching them makes Cargo rebuild the workspace
# crates instead of trusting the stubs' newer timestamps.
COPY crates crates
RUN find crates/structs-puzzles/src crates/structs-game-db/src crates/structs-game-api/src \
      crates/structs-game-server/src -name '*.rs' -exec touch {} + \
 && cargo build --release --locked --manifest-path crates/Cargo.toml \
      -p structs-game-server -p structs-game-db --bin structs-game-server --bin seed-daily

# ===== Stage 2: Seeding the fixture puzzles =====
# Used by docker-compose.daily.yml to fill a fresh database before the
# server starts.
FROM debian:bookworm-slim AS seed-runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --no-create-home --shell /usr/sbin/nologin structs
COPY --from=builder /app/crates/target/release/seed-daily /usr/local/bin/seed-daily
USER structs
ENTRYPOINT ["/usr/local/bin/seed-daily"]

# ===== Stage 3: Running the server =====
# The last stage, so a build without --target gives the server.
FROM debian:bookworm-slim AS runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --no-create-home --shell /usr/sbin/nologin structs
COPY --from=builder /app/crates/target/release/structs-game-server /usr/local/bin/structs-game-server
USER structs
ENV PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=5s --timeout=3s --retries=10 CMD ["/usr/local/bin/structs-game-server", "--healthcheck"]
ENTRYPOINT ["/usr/local/bin/structs-game-server"]
