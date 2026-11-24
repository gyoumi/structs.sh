//! Verifies an existing database on `0001_daily_puzzles` upgrades cleanly to
//! `0002_rename_daily_challenges` without losing scheduled rows.

mod common;

use common::{date, new_puzzle, samples};
use daily_db::{get_public_challenge_by_date, migrate};
use sqlx::Executor;
use sqlx::postgres::PgPoolOptions;

#[tokio::test]
async fn upgrades_from_0001_daily_puzzles_preserving_rows() {
    let Ok(url) = std::env::var("DATABASE_URL") else {
        eprintln!("upgrades_from_0001: DATABASE_URL is not set, skipping Postgres test");
        return;
    };
    let schema = format!("daily_db_upgrade_{}", std::process::id());
    let admin = daily_db::connect(&url).await.expect("connect");
    sqlx::query(&format!("CREATE SCHEMA \"{schema}\""))
        .execute(&admin)
        .await
        .expect("create schema");
    let schema_conn = schema.clone();
    let pool = PgPoolOptions::new()
        .max_connections(2)
        .after_connect(move |conn, _| {
            let s = schema_conn.clone();
            Box::pin(async move {
                conn.execute(format!("SET search_path TO \"{s}\"").as_str())
                    .await?;
                Ok(())
            })
        })
        .connect(&url)
        .await
        .expect("connect schema pool");

    let mut m0001 = sqlx::migrate!("./migrations");
    m0001.migrations.to_mut().retain(|m| m.version == 1);
    m0001.run(&pool).await.expect("apply 0001_daily_puzzles");
    let sample = new_puzzle(&samples([0, 1, 2, 3, 4, 5, 6])[0], date(2026, 7, 1));
    sqlx::query(
        "INSERT INTO daily_puzzles (puzzle_date, number, template, template_version, \
         instance, rules, seed, goal, best_score, best_solution, bot_goal_rate, bot_best_rate) \
         VALUES ($1, 1, $2, 1, $3, $4, 7, $5, $6, $7, 0.25, 0.05)",
    )
    .bind(sample.challenge_date)
    .bind(sample.instance.template_id())
    .bind(sqlx::types::Json(&sample.instance))
    .bind(&sample.rules)
    .bind(sample.goal as i32)
    .bind(sample.best_score as i32)
    .bind(sqlx::types::Json(&sample.best_solution))
    .execute(&pool)
    .await
    .expect("insert pre-upgrade row");

    migrate(&pool).await.expect("upgrade to 0002");
    let got = get_public_challenge_by_date(&pool, sample.challenge_date)
        .await
        .expect("read upgraded row")
        .expect("upgraded row exists");
    pool.close().await;
    sqlx::query(&format!("DROP SCHEMA IF EXISTS \"{schema}\" CASCADE"))
        .execute(&admin)
        .await
        .expect("drop schema");
    admin.close().await;
    assert_eq!(got.number, 1);
    assert_eq!(got.goal, sample.goal);
    assert_eq!(got.date, sample.challenge_date);
}
