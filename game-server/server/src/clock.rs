//! Where the server gets the time, and the Sydney date that picks the challenge.

use std::sync::RwLock;

use chrono::{DateTime, Utc};

pub use daily_db::sydney_date;

/// A source of the current time.
pub trait Clock: Send + Sync {
    /// The current instant.
    fn now(&self) -> DateTime<Utc>;
}

/// The machine's clock.
#[derive(Debug, Clone, Copy, Default)]
pub struct SystemClock;

impl Clock for SystemClock {
    fn now(&self) -> DateTime<Utc> {
        Utc::now()
    }
}

/// A clock that stays at the time it was given until [`set`](Self::set).
#[derive(Debug)]
pub struct FixedClock {
    now: RwLock<DateTime<Utc>>,
}

impl FixedClock {
    /// A clock stopped at `now`.
    pub fn new(now: DateTime<Utc>) -> Self {
        Self {
            now: RwLock::new(now),
        }
    }

    /// Moves the clock to `now`.
    pub fn set(&self, now: DateTime<Utc>) {
        *self.now.write().unwrap_or_else(|e| e.into_inner()) = now;
    }
}

impl Clock for FixedClock {
    fn now(&self) -> DateTime<Utc> {
        *self.now.read().unwrap_or_else(|e| e.into_inner())
    }
}
