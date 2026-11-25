//! Verifies an existing database on `0001_daily_puzzles` upgrades cleanly to
//! `0002_rename_daily_challenges` without losing scheduled rows. Runs only
//! when `DATABASE_URL` is set, in its own disposable schema.

mod common;

use common::{date, new_challenge, samples, with_empty_schema};
use daily_db::{get_public_challenge_by_date, migrate};

#[tokio::test]
async fn upgrades_from_0001_daily_puzzles_preserving_rows() {
    with_empty_schema("upgrades_from_0001_daily_puzzles", |pool| async move {
        let mut m0001 = sqlx::migrate!("./migrations");
        m0001.migrations.to_mut().retain(|m| m.version == 1);
        m0001
            .run(&pool)
            .await
            .unwrap_or_else(|e| panic!("apply only 0001_daily_puzzles to an empty schema: {e}"));
        let challenge = new_challenge(&samples([0, 1, 2, 3, 4, 5, 6])[0], date(2026, 7, 1));
        sqlx::query(
            "INSERT INTO daily_puzzles (puzzle_date, number, template, template_version, \
             instance, rules, seed, goal, best_score, best_solution, bot_goal_rate, bot_best_rate) \
             VALUES ($1, 1, $2, 1, $3, $4, 7, $5, $6, $7, 0.25, 0.05)",
        )
        .bind(challenge.challenge_date)
        .bind(challenge.instance.template_id())
        .bind(sqlx::types::Json(&challenge.instance))
        .bind(&challenge.rules)
        .bind(challenge.goal as i32)
        .bind(challenge.best_score as i32)
        .bind(sqlx::types::Json(&challenge.best_solution))
        .execute(&pool)
        .await
        .unwrap_or_else(|e| panic!("insert a row into the 0001 daily_puzzles table: {e}"));

        let call = format!(
            "after migrate() upgrades 0001 -> 0002, get_public_challenge_by_date({})",
            challenge.challenge_date
        );
        migrate(&pool)
            .await
            .unwrap_or_else(|e| panic!("migrate() on a schema at 0001_daily_puzzles: {e}"));
        let got = get_public_challenge_by_date(&pool, challenge.challenge_date)
            .await
            .unwrap_or_else(|e| panic!("{call}: query failed: {e:?}"))
            .unwrap_or_else(|| {
                panic!("{call}: expected the row inserted before the upgrade, got None")
            });
        assert_eq!(
            (got.number, got.goal, got.date),
            (1, challenge.goal, challenge.challenge_date),
            "{call}: expected (number, goal, date) of the pre-upgrade row, got {got:?}"
        );
    })
    .await;
}
