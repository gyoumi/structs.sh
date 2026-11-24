//! Runs the daily game server.
//!
//! Configuration comes from the environment:
//! - `DATABASE_URL` (required): the Postgres database to read puzzles from.
//!   The server never runs migrations.
//! - `BIND_ADDR`: the address to listen on; defaults to `0.0.0.0:$PORT`.
//! - `PORT`: the port used when `BIND_ADDR` is unset; defaults to `8080`.
//! - `STRUCTS_NOW`: an RFC 3339 time to stop the clock at, for tests and
//!   previews; unset means the real time.
//! - `RUST_LOG`: the log filter; defaults to `info`.

use std::process::ExitCode;
use std::sync::Arc;

use chrono::{DateTime, Utc};
use structs_game_server::{Clock, FixedClock, SystemClock, build_router, describe_db_error};
use tokio::net::TcpListener;
use tracing_subscriber::EnvFilter;

/// The port used when neither `BIND_ADDR` nor `PORT` is set.
const DEFAULT_PORT: &str = "8080";

/// Settings read from the environment.
struct Config {
    database_url: String,
    bind_addr: String,
    clock: Arc<dyn Clock>,
}

#[tokio::main]
async fn main() -> ExitCode {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();
    match run().await {
        Ok(()) => ExitCode::SUCCESS,
        Err(message) => {
            tracing::error!("{message}");
            ExitCode::FAILURE
        }
    }
}

/// Reads the config, connects, and serves until a shutdown signal.
async fn run() -> Result<(), String> {
    let config = read_config()?;
    let pool = structs_game_db::connect(&config.database_url)
        .await
        .map_err(|err| {
            format!(
                "connecting to the database failed: {}",
                describe_db_error(&err)
            )
        })?;
    let listener = TcpListener::bind(&config.bind_addr)
        .await
        .map_err(|err| format!("binding {} failed: {err}", config.bind_addr))?;
    let local = listener
        .local_addr()
        .map_or_else(|_| config.bind_addr.clone(), |addr| addr.to_string());
    tracing::info!(addr = %local, "structs-game-server listening");
    axum::serve(listener, build_router(pool, config.clock))
        .with_graceful_shutdown(shutdown_signal())
        .await
        .map_err(|err| format!("serving failed: {err}"))
}

/// Reads [`Config`] from the environment, without echoing secret values.
fn read_config() -> Result<Config, String> {
    let database_url = non_blank("DATABASE_URL")
        .ok_or_else(|| "DATABASE_URL must be set to a Postgres connection URL".to_owned())?;
    let bind_addr = non_blank("BIND_ADDR").unwrap_or_else(|| {
        let port = non_blank("PORT").unwrap_or_else(|| DEFAULT_PORT.to_owned());
        format!("0.0.0.0:{port}")
    });
    let clock: Arc<dyn Clock> = match non_blank("STRUCTS_NOW") {
        Some(now) => {
            let now = DateTime::parse_from_rfc3339(&now).map_err(|err| {
                format!(
                    "STRUCTS_NOW must be an RFC 3339 time such as 2026-11-24T09:00:00+11:00: {err}"
                )
            })?;
            Arc::new(FixedClock::new(now.with_timezone(&Utc)))
        }
        None => Arc::new(SystemClock),
    };
    Ok(Config {
        database_url,
        bind_addr,
        clock,
    })
}

/// The trimmed value of `name`, or `None` when it is unset or blank.
fn non_blank(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

/// Resolves on Ctrl-C (SIGINT) or, on Unix, SIGTERM.
async fn shutdown_signal() {
    let interrupt = async {
        if tokio::signal::ctrl_c().await.is_err() {
            std::future::pending::<()>().await;
        }
    };
    #[cfg(unix)]
    let terminate = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut signal) => {
                signal.recv().await;
            }
            Err(_) => std::future::pending::<()>().await,
        }
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! {
        () = interrupt => {}
        () = terminate => {}
    }
    tracing::info!("shutting down");
}
