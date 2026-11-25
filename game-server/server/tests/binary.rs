//! The `daily-server` binary at startup: the configs it must refuse (and
//! which secrets its error must not print), and `--healthcheck`. None of
//! these tests need a database.

mod common;

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::process::{Command, ExitStatus, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use common::UNREACHABLE_DSN;

/// Every variable the binary reads. Each run starts with all of them unset,
/// so the test runner's own environment can't change the outcome.
const SERVER_ENV: [&str; 6] = [
    "DATABASE_URL",
    "BIND_ADDR",
    "PORT",
    "DAILY_NOW",
    "DAILY_TEST_CLOCK_BIND",
    "RUST_LOG",
];

/// How long one run may take before it counts as hanging.
const RUN_LIMIT: Duration = Duration::from_secs(20);

/// A password hidden in a `DATABASE_URL` query parameter.
const QUERY_SECRET: &str = "supers3cr3t-query-pw";

/// What one run of the binary did.
struct Run {
    /// `None` when the binary was still running at [`RUN_LIMIT`] and was killed.
    status: Option<ExitStatus>,
    /// stdout followed by stderr.
    output: String,
}

impl Run {
    /// The exit status and output, for failure messages.
    fn describe(&self) -> String {
        let status = match self.status {
            Some(status) => status.to_string(),
            None => format!("still running after {RUN_LIMIT:?} (killed)"),
        };
        format!("{status}, output {:?}", self.output)
    }

    fn succeeded(&self) -> bool {
        self.status.is_some_and(|status| status.success())
    }
}

/// Reads all of `pipe` on its own thread, so a full pipe can't block the child.
fn drain(pipe: Option<impl Read + Send + 'static>) -> thread::JoinHandle<String> {
    thread::spawn(move || {
        let mut text = String::new();
        if let Some(mut pipe) = pipe {
            let mut bytes = Vec::new();
            let _ = pipe.read_to_end(&mut bytes);
            text = String::from_utf8_lossy(&bytes).into_owned();
        }
        text
    })
}

/// Runs the binary with `args` and only `env` (plus `BIND_ADDR=127.0.0.1:0`
/// unless `env` sets it) out of [`SERVER_ENV`], and captures what it printed.
/// A run that outlives [`RUN_LIMIT`] is killed and reported as hanging.
fn run_server(args: &[&str], env: &[(&str, &str)]) -> Run {
    let mut command = Command::new(env!("CARGO_BIN_EXE_daily-server"));
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for name in SERVER_ENV {
        command.env_remove(name);
    }
    // Never listen on a real port, even if a bad config were accepted.
    command.env("BIND_ADDR", "127.0.0.1:0");
    for &(name, value) in env {
        command.env(name, value);
    }
    let mut child = command
        .spawn()
        .unwrap_or_else(|e| panic!("spawn daily-server {args:?} with {env:?}: {e}"));
    let stdout = drain(child.stdout.take());
    let stderr = drain(child.stderr.take());
    let deadline = Instant::now() + RUN_LIMIT;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                break None;
            }
            Ok(None) => thread::sleep(Duration::from_millis(10)),
            Err(e) => panic!("wait for daily-server {args:?} with {env:?}: {e}"),
        }
    };
    let output = format!(
        "{}{}",
        stdout.join().unwrap_or_default(),
        stderr.join().unwrap_or_default()
    );
    Run { status, output }
}

/// A startup config the binary must refuse.
struct BadConfig {
    why: &'static str,
    env: Vec<(&'static str, String)>,
    /// Words the error must contain, so the operator knows what to fix.
    names: &'static [&'static str],
    /// Text from the config that the error must not print.
    secrets: &'static [&'static str],
}

fn bad_configs() -> Vec<BadConfig> {
    let dsn = || ("DATABASE_URL", UNREACHABLE_DSN.to_owned());
    let dsn_secrets: &[&str] = &["s3cret-pa55word", "leaky_user"];
    vec![
        BadConfig {
            why: "DATABASE_URL unset",
            env: vec![],
            names: &[],
            secrets: &[],
        },
        BadConfig {
            why: "DAILY_NOW is not an RFC 3339 time",
            env: vec![dsn(), ("DAILY_NOW", "not-a-timestamp".to_owned())],
            names: &["DAILY_NOW"],
            secrets: dsn_secrets,
        },
        BadConfig {
            why: "DATABASE_URL has an invalid sslmode that hides a password",
            env: vec![
                (
                    "DATABASE_URL",
                    format!(
                        "postgres://structs:pw@127.0.0.1:5432/daily_challenges\
                         ?sslmode=postgres%3A%2F%2Fu%3A{QUERY_SECRET}%40db%2Fapp"
                    ),
                ),
                ("DAILY_NOW", "2026-07-01T14:00:00Z".to_owned()),
            ],
            names: &[],
            secrets: &[QUERY_SECRET],
        },
        BadConfig {
            why: "DAILY_TEST_CLOCK_BIND set with DAILY_NOW unset \
                  (clock control must never drive the real SystemClock)",
            env: vec![dsn(), ("DAILY_TEST_CLOCK_BIND", "127.0.0.1:0".to_owned())],
            names: &["DAILY_TEST_CLOCK_BIND", "DAILY_NOW"],
            secrets: dsn_secrets,
        },
        BadConfig {
            why: "DAILY_TEST_CLOCK_BIND set with DAILY_NOW blank \
                  (clock control must never drive the real SystemClock)",
            env: vec![
                dsn(),
                ("DAILY_TEST_CLOCK_BIND", "127.0.0.1:0".to_owned()),
                ("DAILY_NOW", "   ".to_owned()),
            ],
            names: &["DAILY_TEST_CLOCK_BIND", "DAILY_NOW"],
            secrets: dsn_secrets,
        },
    ]
}

#[test]
fn binary_refuses_bad_startup_config_without_leaking_secrets() {
    for config in bad_configs() {
        let env: Vec<(&str, &str)> = config
            .env
            .iter()
            .map(|(name, value)| (*name, value.as_str()))
            .collect();
        let run = run_server(&[], &env);
        let call = format!("daily-server with {} (env {env:?})", config.why);
        assert!(
            run.status.is_some_and(|status| !status.success()),
            "{call}: expected a non-zero exit, got {}",
            run.describe()
        );
        for name in config.names {
            assert!(
                run.output.contains(name),
                "{call}: the error should name {name:?}, got {}",
                run.describe()
            );
        }
        for secret in config.secrets {
            assert!(
                !run.output.contains(secret),
                "{call}: the startup error must not print {secret:?} from the config, got {}",
                run.describe()
            );
        }
    }
}

#[test]
fn binary_healthcheck_follows_bind_addr() {
    // A mock `/healthz` on loopback that answers one connection: 200 for
    // `GET /healthz`, 404 for anything else.
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind mock healthz listener");
    let addr = listener.local_addr().expect("listener local addr");
    let port = addr.port();
    let handle = thread::spawn(move || {
        if let Ok((mut stream, _)) = listener.accept() {
            let mut req = Vec::new();
            let mut buf = [0u8; 256];
            while !req.windows(4).any(|w| w == b"\r\n\r\n") {
                match stream.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => req.extend_from_slice(&buf[..n]),
                }
            }
            let reply: &[u8] = if req.starts_with(b"GET /healthz ") {
                b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok"
            } else {
                b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
            };
            let _ = stream.write_all(reply);
        }
    });

    let bind_addr = format!("0.0.0.0:{port}");
    let run = run_server(
        &["--healthcheck"],
        &[("BIND_ADDR", bind_addr.as_str()), ("PORT", "1")],
    );

    // If the probe went elsewhere, the mock is still waiting in `accept`:
    // wake it with a connection we close at once, so the join below can't
    // block. If the probe already came, the listener is closed (or about to
    // be) and this connect fails or goes unanswered, which is fine.
    drop(TcpStream::connect(addr));
    handle.join().expect("join mock healthz thread");

    assert!(
        run.succeeded(),
        "daily-server --healthcheck with BIND_ADDR={bind_addr} and PORT=1 should probe \
         GET /healthz on 127.0.0.1:{port} (the wildcard BIND_ADDR on loopback, not PORT) \
         and exit 0, got {}",
        run.describe()
    );
}
