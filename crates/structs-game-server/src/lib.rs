//! Read-only HTTP server for the structs.sh daily game.
//!
//! [`build_router`] serves today's puzzle at `GET /api/daily`, choosing the
//! day by the [`Clock`]'s date in Sydney, and `GET /healthz`. Tests can
//! move a [`FixedClock`] through [`build_test_clock_router`]'s `/clock`.

mod clock;
mod convert;
mod routes;
mod test_clock;

pub use clock::{Clock, FixedClock, SystemClock, sydney_date};
pub use convert::to_daily_puzzle;
pub use routes::build_router;
pub use structs_game_db::describe_db_error;
pub use test_clock::build_test_clock_router;
