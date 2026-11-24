# The daily challenge HTTP server and the `seed-daily` fixture seeder. Build
# from the repo root, because the toolchain file and the Cargo workspace live
# there:
#   docker build -f game-server/Dockerfile .
#   docker build -f game-server/Dockerfile --target seed-runtime .

# ===== Stage 1: Building the server =====
FROM rust:1.99-slim-bookworm AS builder
WORKDIR /app
ENV SQLX_OFFLINE=true
COPY rust-toolchain.toml ./
RUN rustup toolchain install

# Build the dependencies against stub sources first, so this layer stays
# cached until a Cargo.toml or Cargo.lock changes.
COPY game-server/Cargo.toml game-server/Cargo.lock game-server/
COPY game-server/challenges/Cargo.toml game-server/challenges/
COPY game-server/db/Cargo.toml game-server/db/
COPY game-server/api/Cargo.toml game-server/api/
COPY game-server/server/Cargo.toml game-server/server/
RUN for crate in challenges db api server; do \
      mkdir -p game-server/$crate/src && touch game-server/$crate/src/lib.rs; \
    done \
 && echo 'fn main() {}' > game-server/server/src/main.rs \
 && mkdir -p game-server/db/src/bin \
 && echo 'fn main() {}' > game-server/db/src/bin/seed-daily.rs \
 && cargo build --release --locked --manifest-path game-server/Cargo.toml \
      -p daily-server -p daily-db --bin daily-server --bin seed-daily

# Then the real sources. Touching them makes Cargo rebuild the workspace
# crates instead of trusting the stubs' newer timestamps.
COPY game-server game-server
RUN find game-server/challenges/src game-server/db/src game-server/api/src \
      game-server/server/src -name '*.rs' -exec touch {} + \
 && cargo build --release --locked --manifest-path game-server/Cargo.toml \
      -p daily-server -p daily-db --bin daily-server --bin seed-daily

# ===== Stage 2: Seeding the fixture challenges =====
# Used by docker-compose.daily.yml to fill a fresh database before the
# server starts.
FROM debian:bookworm-slim AS seed-runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --no-create-home --shell /usr/sbin/nologin daily
COPY --from=builder /app/game-server/target/release/seed-daily /usr/local/bin/seed-daily
USER daily
ENTRYPOINT ["/usr/local/bin/seed-daily"]

# ===== Stage 3: Running the server =====
# The last stage, so a build without --target gives the server.
FROM debian:bookworm-slim AS runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --no-create-home --shell /usr/sbin/nologin daily
COPY --from=builder /app/game-server/target/release/daily-server /usr/local/bin/daily-server
USER daily
ENV PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=5s --timeout=3s --retries=10 CMD ["/usr/local/bin/daily-server", "--healthcheck"]
ENTRYPOINT ["/usr/local/bin/daily-server"]
