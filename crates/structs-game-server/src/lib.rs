//! Read-only HTTP server for the structs.sh daily game.
//!
//! [`build_router`] serves today's puzzle at `GET /api/daily`, choosing the
//! day by the [`Clock`]'s date in Sydney, and `GET /healthz`.

mod clock;
mod convert;
mod routes;
mod sanitize;

pub use clock::{Clock, FixedClock, SystemClock, sydney_date};
pub use convert::to_daily_puzzle;
pub use routes::build_router;
pub use sanitize::describe_db_error;
