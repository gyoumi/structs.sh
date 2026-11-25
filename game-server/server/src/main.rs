//! Runs the daily game server.
//!
//! Configuration comes from the environment:
//! - `DATABASE_URL` (required): the Postgres database to read challenges from.
//!   The server never runs migrations.
//! - `BIND_ADDR`: the address to listen on; defaults to `0.0.0.0:$PORT`.
//! - `PORT`: the port used when `BIND_ADDR` is unset; defaults to `8080`.
//! - `DAILY_NOW`: an RFC 3339 time to stop the clock at, for tests and
//!   previews; unset means the real time.
//! - `DAILY_TEST_CLOCK_BIND`: an address to serve `GET`/`PUT /clock` on,
//!   so tests can move the stopped clock. Needs `DAILY_NOW`.
//! - `RUST_LOG`: the log filter; defaults to `info`.
//!
//! `daily-server --healthcheck` instead checks that a server on
//! `127.0.0.1:$PORT` answers `GET /healthz`, for Docker's `HEALTHCHECK`.

use std::io::{Read, Write};
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr, TcpStream, ToSocketAddrs};
use std::process::ExitCode;
use std::sync::Arc;
use std::time::Duration;

use axum::Router;
use chrono::{DateTime, Utc};
use daily_server::{
    Clock, FixedClock, SystemClock, build_router, build_test_clock_router, describe_db_error,
};
use tokio::net::TcpListener;
use tokio::sync::watch;
use tracing_subscriber::EnvFilter;

/// The port used when neither `BIND_ADDR` nor `PORT` is set.
const DEFAULT_PORT: &str = "8080";

/// How long `--healthcheck` waits to connect, write, or read.
const HEALTHCHECK_TIMEOUT: Duration = Duration::from_secs(2);

/// Settings read from the environment.
struct Config {
    database_url: String,
    bind_addr: String,
    clock: ServerClock,
}

/// The clock the server reads, and where tests may move it.
enum ServerClock {
    /// The machine's clock.
    System,
    /// A stopped clock, with the address of its `/clock` routes if any.
    Fixed {
        clock: Arc<FixedClock>,
        control_bind: Option<String>,
    },
}

fn main() -> ExitCode {
    if std::env::args().nth(1).as_deref() == Some("--healthcheck") {
        return healthcheck();
    }
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();
    let runtime = match tokio::runtime::Runtime::new() {
        Ok(runtime) => runtime,
        Err(err) => {
            tracing::error!("starting the async runtime failed: {err}");
            return ExitCode::FAILURE;
        }
    };
    match runtime.block_on(run()) {
        Ok(()) => ExitCode::SUCCESS,
        Err(message) => {
            tracing::error!("{message}");
            ExitCode::FAILURE
        }
    }
}

/// The address the API listener binds, from `BIND_ADDR` or `0.0.0.0:$PORT`.
fn configured_bind_addr() -> String {
    non_blank("BIND_ADDR").unwrap_or_else(|| {
        let port = non_blank("PORT").unwrap_or_else(|| DEFAULT_PORT.to_owned());
        format!("0.0.0.0:{port}")
    })
}

/// Maps wildcard bind addresses (`0.0.0.0` / `::`) to loopback for local probes.
fn probe_addr(bind_addr: &str) -> std::io::Result<SocketAddr> {
    let addr = bind_addr
        .to_socket_addrs()?
        .next()
        .ok_or_else(|| std::io::Error::other("bind address resolved to no socket address"))?;
    let ip = match addr.ip() {
        IpAddr::V4(v4) if v4.is_unspecified() => IpAddr::V4(Ipv4Addr::LOCALHOST),
        IpAddr::V6(v6) if v6.is_unspecified() => IpAddr::V6(Ipv6Addr::LOCALHOST),
        other => other,
    };
    Ok(SocketAddr::new(ip, addr.port()))
}

/// Succeeds when `GET /healthz` on the configured bind address answers `200`.
fn healthcheck() -> ExitCode {
    let bind_addr = configured_bind_addr();
    let healthy = (|| -> std::io::Result<bool> {
        let addr = probe_addr(&bind_addr)?;
        let mut stream = TcpStream::connect_timeout(&addr, HEALTHCHECK_TIMEOUT)?;
        stream.set_read_timeout(Some(HEALTHCHECK_TIMEOUT))?;
        stream.set_write_timeout(Some(HEALTHCHECK_TIMEOUT))?;
        stream
            .write_all(b"GET /healthz HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")?;
        let mut response = Vec::new();
        stream.read_to_end(&mut response)?;
        Ok(response.starts_with(b"HTTP/1.1 200"))
    })();
    if matches!(healthy, Ok(true)) {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    }
}

/// Reads the config, connects, and serves until a shutdown signal.
async fn run() -> Result<(), String> {
    let config = read_config()?;
    let pool = daily_db::connect(&config.database_url)
        .await
        .map_err(|err| {
            format!(
                "connecting to the database failed: {}",
                describe_db_error(&err)
            )
        })?;
    let (clock, control): (Arc<dyn Clock>, _) = match config.clock {
        ServerClock::System => (Arc::new(SystemClock), None),
        ServerClock::Fixed {
            clock,
            control_bind,
        } => (clock.clone(), control_bind.map(|bind| (bind, clock))),
    };
    let api = bind(&config.bind_addr, "daily-server").await?;
    let control = match control {
        Some((addr, clock)) => Some((bind(&addr, "test clock").await?, clock)),
        None => None,
    };
    let (stop, stopped) = watch::channel(false);
    tokio::spawn(async move {
        shutdown_signal().await;
        let _ = stop.send(true);
    });
    let api = serve(api, build_router(pool, clock), stopped.clone());
    match control {
        Some((listener, clock)) => {
            let control = serve(listener, build_test_clock_router(clock), stopped);
            tokio::try_join!(api, control).map(|_| ())
        }
        None => api.await,
    }
}

/// Listens on `addr`, logging it under `name`.
async fn bind(addr: &str, name: &str) -> Result<TcpListener, String> {
    let listener = TcpListener::bind(addr)
        .await
        .map_err(|err| format!("binding {addr} failed: {err}"))?;
    let local = listener
        .local_addr()
        .map_or_else(|_| addr.to_owned(), |local| local.to_string());
    tracing::info!(addr = %local, "{name} listening");
    Ok(listener)
}

/// Serves `router` on `listener` until `stopped` turns true.
async fn serve(
    listener: TcpListener,
    router: Router,
    mut stopped: watch::Receiver<bool>,
) -> Result<(), String> {
    axum::serve(listener, router)
        .with_graceful_shutdown(async move {
            let _ = stopped.wait_for(|stop| *stop).await;
        })
        .await
        .map_err(|err| format!("serving failed: {err}"))
}

/// Reads [`Config`] from the environment, without echoing secret values.
fn read_config() -> Result<Config, String> {
    let bind_addr = configured_bind_addr();
    let control_bind = non_blank("DAILY_TEST_CLOCK_BIND");
    let clock = match non_blank("DAILY_NOW") {
        Some(now) => {
            let now = DateTime::parse_from_rfc3339(&now).map_err(|err| {
                format!(
                    "DAILY_NOW must be an RFC 3339 time such as 2026-11-24T09:00:00+11:00: {err}"
                )
            })?;
            ServerClock::Fixed {
                clock: Arc::new(FixedClock::new(now.with_timezone(&Utc))),
                control_bind,
            }
        }
        None if control_bind.is_some() => {
            return Err(
                "DAILY_TEST_CLOCK_BIND needs DAILY_NOW: set DAILY_NOW to the \
                        RFC 3339 time the test clock starts at"
                    .to_owned(),
            );
        }
        None => ServerClock::System,
    };
    let database_url = non_blank("DATABASE_URL")
        .ok_or_else(|| "DATABASE_URL must be set to a Postgres connection URL".to_owned())?;
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
