ALTER TABLE daily_puzzles RENAME TO daily_challenges;
ALTER TABLE daily_challenges RENAME COLUMN puzzle_date TO challenge_date;
