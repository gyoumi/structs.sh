//! Describing database errors without leaking the connection string.
//!
//! sqlx's own messages can quote the database URL (configuration errors) or
//! values from a query, so logs only ever get the error's kind and, for a
//! Postgres error, its SQLSTATE code.

use crate::error::DbError;

/// A log-safe summary of `err`: its kind, never its message.
pub fn describe_db_error(err: &DbError) -> String {
    match err {
        DbError::Sqlx(err) => describe_sqlx_error(err),
        DbError::Migrate(_) => "migration error".to_owned(),
        DbError::InvalidData(_) => "stored puzzle data is invalid".to_owned(),
    }
}

/// The kind of a driver error, with only codes that carry no secrets.
fn describe_sqlx_error(err: &sqlx::Error) -> String {
    match err {
        sqlx::Error::Configuration(_) => "invalid database configuration".to_owned(),
        sqlx::Error::Database(db) => match db.code() {
            Some(code) => format!("database error (SQLSTATE {code})"),
            None => "database error".to_owned(),
        },
        sqlx::Error::Io(io) => format!("database I/O error ({:?})", io.kind()),
        sqlx::Error::Tls(_) => "database TLS error".to_owned(),
        sqlx::Error::Protocol(_) => "database protocol error".to_owned(),
        sqlx::Error::PoolTimedOut => "timed out waiting for a database connection".to_owned(),
        sqlx::Error::PoolClosed => "database pool is closed".to_owned(),
        sqlx::Error::WorkerCrashed => "database worker crashed".to_owned(),
        sqlx::Error::ColumnDecode { .. } | sqlx::Error::Decode(_) => {
            "could not decode a database value".to_owned()
        }
        _ => "database error".to_owned(),
    }
}
