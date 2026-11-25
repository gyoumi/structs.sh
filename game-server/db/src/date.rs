//! The Sydney calendar date, which picks each day's challenge.

use chrono::{DateTime, NaiveDate, Utc};
use chrono_tz::Australia::Sydney;

/// The calendar date in Sydney at the instant `utc`.
pub fn sydney_date(utc: DateTime<Utc>) -> NaiveDate {
    utc.with_timezone(&Sydney).date_naive()
}
