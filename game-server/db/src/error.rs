//! Errors returned by the daily puzzle store.

/// Why a database call or a puzzle check failed.
#[derive(Debug, thiserror::Error)]
pub enum DbError {
    /// The Postgres driver reported an error.
    #[error("database error: {0}")]
    Sqlx(#[from] sqlx::Error),
    /// Running the schema migrations failed.
    #[error("migration error: {0}")]
    Migrate(#[from] sqlx::migrate::MigrateError),
    /// A puzzle, solution, or stored row broke one of the store's rules.
    #[error("invalid challenge data: {0}")]
    InvalidData(String),
}
