import crypto from "node:crypto";
import { config } from "./config.js";
import { getDb, ensureDailyChallenge, getDailyChallengeRecord } from "./db.js";
import {
  cookieOptions,
  createAdminToken,
  createPlayerToken,
  fingerprintFromFields,
  isAdmin,
  readPlayer,
  requireAdmin,
  sanitizeText,
} from "./auth.js";
import { calculateScore, evaluateGuess, isExactMatch, isValidGuess } from "./gameLogic.js";
import { getChallengeMeta } from "./challenge.js";
import { sendWeeklyReport } from "./email.js";

const ACTIVE_WINDOW_MS = 2 * 60 * 1000;

function publicSession(session, challenge, guesses, includeSecret = false) {
  const payload = {
    challengeDate: challenge.challenge_date,
    dayNumber: challenge.day_number,
    codeLength: challenge.code_length,
    maxAttempts: challenge.max_attempts,
    status: session.status,
    attemptsUsed: session.attempts_used,
    score: session.score,
    guesses: guesses.map((g) => ({
      guess: g.guess,
      feedback: JSON.parse(g.feedback),
    })),
    startedAt: session.started_at,
    completedAt: session.completed_at,
    completionSeconds: session.completion_seconds,
  };
  if (includeSecret && (session.status === "won" || session.status === "lost")) {
    payload.secretCode = session.secret_code;
  }
  return payload;
}
function getOrCreateSession(participantId) {
  const database = getDb();
  const challenge = getDailyChallengeRecord(ensureDailyChallenge().date);

  const existing = database
    .prepare(
      "SELECT * FROM game_sessions WHERE participant_id = ? AND challenge_date = ?"
    )
    .get(participantId, challenge.challenge_date);

  // If today's game is already completed, start a fresh game
  if (existing && (existing.status === "won" || existing.status === "lost")) {
    database
      .prepare("DELETE FROM guesses WHERE session_id = ?")
      .run(existing.id);

    database
      .prepare("DELETE FROM game_sessions WHERE id = ?")
      .run(existing.id);
  } else if (existing) {
    return { session: existing, challenge };
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // Every new game gets a new 4-digit secret code
  const secretCode = Array.from(
    { length: challenge.code_length },
    () => crypto.randomInt(0, 10)
  ).join("");

  database
    .prepare(
      `INSERT INTO game_sessions
        (id, participant_id, challenge_date, status, attempts_used,
         started_at, last_heartbeat, score, secret_code)
       VALUES (?, ?, ?, 'in_progress', 0, ?, ?, 0, ?)`
    )
    .run(
      id,
      participantId,
      challenge.challenge_date,
      now,
      now,
      secretCode
    );

  const session = database
    .prepare("SELECT * FROM game_sessions WHERE id = ?")
    .get(id);

  return { session, challenge };
}
function heartbeat(sessionId) {
  getDb()
    .prepare("UPDATE game_sessions SET last_heartbeat = ? WHERE id = ? AND status = 'in_progress'")
    .run(new Date().toISOString(), sessionId);
}

function loadGuesses(sessionId) {
  return getDb()
    .prepare("SELECT guess, feedback, created_at FROM guesses WHERE session_id = ? ORDER BY id ASC")
    .all(sessionId);
}

export function collectStats() {
  const database = getDb();
  const meta = getChallengeMeta();
  const now = Date.now();
  const participants = database.prepare("SELECT COUNT(*) AS n FROM participants").get().n;
  const sessions = database.prepare("SELECT * FROM game_sessions").all();
  const wins = sessions.filter((s) => s.status === "won").length;
  const losses = sessions.filter((s) => s.status === "lost").length;
  const completions = wins + losses;
  const completed = sessions.filter((s) => s.status === "won" || s.status === "lost");
  const averageAttempts = completed.length
    ? Math.round((completed.reduce((sum, s) => sum + s.attempts_used, 0) / completed.length) * 10) / 10
    : 0;
  const averageScore = completed.length
    ? Math.round(completed.reduce((sum, s) => sum + s.score, 0) / completed.length)
    : 0;

  const leaderboard = database
    .prepare(
      `SELECT p.full_name, p.branch, p.section, p.year, s.*, c.day_number, c.code_length, c.max_attempts
       FROM game_sessions s
       JOIN participants p ON p.id = s.participant_id
       JOIN daily_challenges c ON c.challenge_date = s.challenge_date
       WHERE s.status IN ('won','lost')
       ORDER BY s.score DESC, s.attempts_used ASC, COALESCE(s.completion_seconds, 999999) ASC`
    )
    .all();

  const dayWise = {};
  for (const row of leaderboard) {
    const key = `Day ${row.day_number}`;
    if (!dayWise[key]) dayWise[key] = { plays: 0, wins: 0, losses: 0, avgScore: 0, scores: [] };
    dayWise[key].plays += 1;
    if (row.status === "won") dayWise[key].wins += 1;
    if (row.status === "lost") dayWise[key].losses += 1;
    dayWise[key].scores.push(row.score);
  }
  for (const key of Object.keys(dayWise)) {
    const d = dayWise[key];
    d.avgScore = d.scores.length ? Math.round(d.scores.reduce((a, b) => a + b, 0) / d.scores.length) : 0;
    delete d.scores;
  }

  const active = database
    .prepare(
      `SELECT p.full_name, p.branch, p.section, s.status, c.day_number, s.last_heartbeat, s.score
       FROM game_sessions s
       JOIN participants p ON p.id = s.participant_id
       JOIN daily_challenges c ON c.challenge_date = s.challenge_date
       ORDER BY s.last_heartbeat DESC
       LIMIT 80`
    )
    .all()
    .filter((row) => now - Date.parse(row.last_heartbeat) < 30 * 60 * 1000);

  const online = active.filter((row) => now - Date.parse(row.last_heartbeat) < ACTIVE_WINDOW_MS);

  return {
    timezone: config.timezone,
    weekLabel: meta.date,
    totalParticipants: participants,
    totalCompletions: completions,
    totalWins: wins,
    totalLosses: losses,
    averageAttempts,
    averageScore,
    dayWise,
    leaderboard,
    topPlayers: leaderboard.slice(0, 10),
    active,
    activeCount: online.length,
    online,
  };
}

function leaderboardQuery(range) {
  const meta = getChallengeMeta();
  let where = "s.status IN ('won','lost')";
  if (range === "today") where += " AND s.challenge_date = ?";
  if (range === "week") where += " AND s.challenge_date >= ?";
  const sql = `
    SELECT p.full_name AS name, p.branch, c.day_number AS day, s.score,
           s.attempts_used AS attemptsUsed, c.max_attempts AS maxAttempts, s.status,
           s.completion_seconds AS completionSeconds
    FROM game_sessions s
    JOIN participants p ON p.id = s.participant_id
    JOIN daily_challenges c ON c.challenge_date = s.challenge_date
    WHERE ${where}
    ORDER BY s.score DESC, s.attempts_used ASC, COALESCE(s.completion_seconds, 999999) ASC
    LIMIT 100
  `;
  if (range === "today") return getDb().prepare(sql).all(meta.date);
  if (range === "week") {
    const start = new Date(`${meta.date}T00:00:00Z`);
    start.setUTCDate(start.getUTCDate() - 6);
    const weekStart = start.toISOString().slice(0, 10);
    return getDb().prepare(sql).all(weekStart);
  }
  return getDb().prepare(sql.replace(" AND s.challenge_date >= ?", "")).all();
}

export function mountRoutes(app) {
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/challenge", (_req, res) => {
    const challenge = ensureDailyChallenge();
    res.json(challenge);
  });

  app.get("/api/me", (req, res) => {
    const participantId = readPlayer(req);
    if (!participantId) return res.json({ player: null, admin: isAdmin(req) });
    const player = getDb().prepare("SELECT id, full_name, branch, section, year FROM participants WHERE id = ?").get(participantId);
    res.json({ player, admin: isAdmin(req) });
  });

  app.post("/api/register", (req, res) => {
    const fullName = sanitizeText(req.body?.fullName, 80);
    const branch = sanitizeText(req.body?.branch, 40);
    const section = sanitizeText(req.body?.section, 20);
    const year = sanitizeText(req.body?.year, 20);
    if (!fullName || !branch || !section || !year) {
      return res.status(400).json({ error: "All fields are required." });
    }
    const fingerprint = fingerprintFromFields({ fullName, branch, section, year });
    const database = getDb();
    let player = database.prepare("SELECT * FROM participants WHERE fingerprint = ?").get(fingerprint);
    if (!player) {
      player = {
        id: crypto.randomUUID(),
        fingerprint,
        full_name: fullName,
        branch,
        section,
        year,
        created_at: new Date().toISOString(),
      };
      database
        .prepare(
          `INSERT INTO participants (id, fingerprint, full_name, branch, section, year, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(player.id, player.fingerprint, player.full_name, player.branch, player.section, player.year, player.created_at);
    }
    ensureDailyChallenge();
    getOrCreateSession(player.id);
    res.cookie("mcc_player", createPlayerToken(player.id), { ...cookieOptions(), maxAge: 14 * 24 * 60 * 60 * 1000 });
    res.json({
      player: {
        id: player.id,
        fullName: player.full_name,
        branch: player.branch,
        section: player.section,
        year: player.year,
      },
    });
  });

  app.get("/api/game", (req, res) => {
    const participantId = readPlayer(req);
    if (!participantId) return res.status(401).json({ error: "Register before entering the arena." });
    const { session, challenge } = getOrCreateSession(participantId);
    heartbeat(session.id);
    const guesses = loadGuesses(session.id);
    const ended = session.status === "won" || session.status === "lost";
    res.json(publicSession(session, challenge, guesses, ended));
  });

  app.post("/api/game/heartbeat", (req, res) => {
    const participantId = readPlayer(req);
    if (!participantId) return res.status(401).json({ error: "No session." });
    const { session } = getOrCreateSession(participantId);
    heartbeat(session.id);
    res.json({ ok: true });
  });

  app.post("/api/game/guess", (req, res) => {
    const participantId = readPlayer(req);
    if (!participantId) return res.status(401).json({ error: "Register before playing." });

    const database = getDb();
    const { session, challenge } = getOrCreateSession(participantId);
    if (session.status !== "in_progress") {
      const guesses = loadGuesses(session.id);
      return res.status(409).json({
        error: "Today's mission is already complete.",
        game: publicSession(session, challenge, guesses, true),
      });
    }

    const guess = String(req.body?.guess ?? "").trim();
    if (!isValidGuess(guess, challenge.code_length)) {
      return res.status(400).json({
        error: `Enter exactly ${challenge.code_length} digits. Spaces and letters are not allowed.`,
      });
    }

    const already = database
      .prepare("SELECT id FROM guesses WHERE session_id = ? AND guess = ?")
      .get(session.id, guess);
    if (already && loadGuesses(session.id).length >= challenge.max_attempts) {
      return res.status(409).json({ error: "No attempts remaining." });
    }

    let nextSession;
    try {
      database.exec("BEGIN");
      const locked = database
        .prepare("SELECT * FROM game_sessions WHERE id = ?")
        .get(session.id);
      if (locked.status !== "in_progress") {
        database.exec("ROLLBACK");
        return res.status(409).json({ error: "Today's mission is already complete." });
      }
      if (locked.attempts_used >= challenge.max_attempts) {
        database.exec("ROLLBACK");
        return res.status(409).json({ error: "No attempts remaining." });
      }

      const feedback = evaluateGuess(locked.secret_code, guess);
      const now = new Date().toISOString();
      database
        .prepare("INSERT INTO guesses (session_id, guess, feedback, created_at) VALUES (?, ?, ?, ?)")
        .run(locked.id, guess, JSON.stringify(feedback), now);
      const attemptsUsed = locked.attempts_used + 1;
      const won = isExactMatch(feedback);
      const lost = !won && attemptsUsed >= challenge.max_attempts;
      const started = Date.parse(locked.started_at);
      const completionSeconds = Math.max(0, Math.floor((Date.now() - started) / 1000));
      let status = "in_progress";
      let score = 0;
      let complet
let completedAt = null;
      let storedSeconds = null;
      if (won || lost) {
        status = won ? "won" : "lost";
        score = calculateScore({
          won,
          codeLength: challenge.code_length,
          remainingAttempts: challenge.max_attempts - attemptsUsed,
          completionTimeSeconds: completionSeconds,
        });
        completedAt = now;
        storedSeconds = completionSeconds;
      }
      database
        .prepare(
          `UPDATE game_sessions
           SET attempts_used = ?, status = ?, score = ?, completed_at = ?, completion_seconds = ?, last_heartbeat = ?
           WHERE id = ?`
        )
        .run(attemptsUsed, status, score, completedAt, storedSeconds, now, locked.id);
      database.exec("COMMIT");
      nextSession = database.prepare("SELECT * FROM game_sessions WHERE id = ?").get(locked.id);
    } catch (error) {
      try {
        database.exec("ROLLBACK");
      } catch {
        /* ignore */
      }
      console.error(error);
      return res.status(500).json({ error: "Could not record that guess. Try once more." });
    }

    const guesses = loadGuesses(nextSession.id);
    const ended = nextSession.status === "won" || nextSession.status === "lost";
    res.json(publicSession(nextSession, challenge, guesses, ended));
  });

  app.get("/api/leaderboard", (req, res) => {
    const range = ["today", "week", "all"].includes(req.query.range) ? req.query.range : "today";
    const rows = leaderboardQuery(range).map((row, index) => ({
      rank: index + 1,
      name: row.name,
      branch: row.branch,
      day: row.day,
      score: row.score,
      attempts: `${row.attemptsUsed}/${row.maxAttempts}`,
      status: row.status === "won" ? "CRACKED" : "FAILED",
    }));
    res.json({ range, rows });
  });

  app.get("/api/active", (req, res) => {
    if (!isAdmin(req)) {
      const online = collectStats().activeCount;
      return res.json({ count: online });
    }
    const stats = collectStats();
    res.json({
      count: stats.activeCount,
      players: stats.online.map((p) => ({
        name: p.full_name,
        branch: p.branch,
        section: p.section,
        day: p.day_number,
        status: p.status === "in_progress" ? "PLAYING" : p.status === "won" ? "CRACKED" : "FAILED",
      })),
    });
  });

  app.post("/api/admin/login", (req, res) => {
    const password = String(req.body?.password ?? "");
    if (!config.organizerPassword) {
      return res.status(503).json({ error: "ORGANIZER_PASSWORD is not configured on the server." });
    }
    const submitted = crypto.createHash("sha256").update(password).digest();
    const expected = crypto.createHash("sha256").update(config.organizerPassword).digest();
    if (!crypto.timingSafeEqual(submitted, expected)) {
      return res.status(401).json({ error: "Access denied." });
    }
    res.cookie("mcc_admin", createAdminToken(), { ...cookieOptions(), maxAge: 12 * 60 * 60 * 1000 });
    res.json({ ok: true });
  });

  app.post("/api/admin/logout", (req, res) => {
    res.clearCookie("mcc_admin", cookieOptions());
    res.json({ ok: true });
  });

  app.get("/api/admin/dashboard", requireAdmin, (_req, res) => {
    res.json(collectStats());
  });

  app.get("/api/admin/export", requireAdmin, (_req, res) => {
    const stats = collectStats();
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=codebreaker-export.csv");
    const header = "name,branch,section,year,day,status,score,attempts,completion_seconds\n";
    const body = stats.leaderboard
      .map(
        (r) =>
          `"${r.full_name}","${r.branch}","${r.section}","${r.year}",${r.day_number},${r.status},${r.score},${r.attempts_used},${r.completion_seconds ?? ""}`
      )
      .join("\n");
    res.send(header + body);
  });

  app.post("/api/admin/report/weekly", requireAdmin, async (_req, res) => {
    const result = await sendWeeklyReport(collectStats());
    res.json(result);
  });
}
