import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";
import { deriveDailyCode, getChallengeMeta } from "./challenge.js";

let db;

export function getDb() {
  if (db) return db;
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  db = new DatabaseSync(config.dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS participants (
      id TEXT PRIMARY KEY,
      fingerprint TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      branch TEXT NOT NULL,
      section TEXT NOT NULL,
      year TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

  CREATE TABLE IF NOT EXISTS daily_challenges (
  challenge_date TEXT PRIMARY KEY,
  day_number INTEGER NOT NULL,
  code_length INTEGER NOT NULL,
  max_attempts INTEGER NOT NULL,
  secret_code TEXT NOT NULL,
  created_at TEXT NOT NULL
);

    CREATE TABLE IF NOT EXISTS game_sessions (
      id TEXT PRIMARY KEY,
      participant_id TEXT NOT NULL,
      challenge_date TEXT NOT NULL,
      status TEXT NOT NULL,
      attempts_used INTEGER NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      completion_seconds INTEGER,
      score INTEGER NOT NULL DEFAULT 0,
      last_heartbeat TEXT NOT NULL,
      secret_code TEXT NOT NULL DEFAULT '0000',
      FOREIGN KEY(participant_id) REFERENCES participants(id),
      FOREIGN KEY(challenge_date) REFERENCES daily_challenges(challenge_date)
    );
     
    CREATE TABLE IF NOT EXISTS guesses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      guess TEXT NOT NULL,
      feedback TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(session_id) REFERENCES game_sessions(id)
    );

    CREATE TABLE IF NOT EXISTS admin_sessions (
      token_hash TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS email_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      detail TEXT,
      created_at TEXT NOT NULL
    );
  `);
  return db;
}

export function ensureDailyChallenge() {
  const database = getDb();
  const meta = getChallengeMeta();
  const existing = database
    .prepare("SELECT * FROM daily_challenges WHERE challenge_date = ?")
    .get(meta.date);
  if (existing) {
    return {
      date: existing.challenge_date,
      dayNumber: existing.day_number,
      codeLength: existing.code_length,
      maxAttempts: existing.max_attempts,
    };
  }
  const secret = deriveDailyCode(meta.date, meta.codeLength);
  const now = new Date().toISOString();
  database
    .prepare(
      `INSERT INTO daily_challenges
        (challenge_date, day_number, code_length, max_attempts, secret_code, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(meta.date, meta.dayNumber, meta.codeLength, meta.maxAttempts, secret, now);
  return {
    date: meta.date,
    dayNumber: meta.dayNumber,
    codeLength: meta.codeLength,
    maxAttempts: meta.maxAttempts,
  };
}

export function getDailyChallengeRecord(date) {
  return getDb().prepare("SELECT * FROM daily_challenges WHERE challenge_date = ?").get(date);
}

export function publicChallenge() {
  return ensureDailyChallenge();
}
