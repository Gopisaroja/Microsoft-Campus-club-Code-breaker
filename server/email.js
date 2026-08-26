import { config } from "./config.js";
import { getDb } from "./db.js";

function hasEmailConfig() {
  return Boolean(config.smtpHost && (config.smtpPass || config.emailApiKey || config.smtpUser));
}

function logEmail(kind, status, detail) {
  getDb()
    .prepare("INSERT INTO email_log (kind, status, detail, created_at) VALUES (?, ?, ?, ?)")
    .run(kind, status, detail, new Date().toISOString());
}

export function buildWeeklyReportHtml(stats) {
  const rows = (list) =>
    list
      .map(
        (p) =>
          `<tr><td>${escapeHtml(p.full_name)}</td><td>${escapeHtml(p.branch)}</td><td>${p.day_number}</td><td>${p.score}</td><td>${p.status}</td></tr>`
      )
      .join("");

  return `<!doctype html>
<html><body style="font-family:Inter,Segoe UI,sans-serif;background:#05060c;color:#f4f5fb;padding:24px">
  <h1>MCC Codebreaker — Weekly Report</h1>
  <p>Official timezone: ${escapeHtml(stats.timezone)}</p>
  <ul>
    <li>Total participants: ${stats.totalParticipants}</li>
    <li>Total completions: ${stats.totalCompletions}</li>
    <li>Total wins: ${stats.totalWins}</li>
    <li>Total losses: ${stats.totalLosses}</li>
    <li>Average attempts: ${stats.averageAttempts}</li>
    <li>Average score: ${stats.averageScore}</li>
    <li>Active / recent players: ${stats.activeCount}</li>
  </ul>
  <h2>Day-wise performance</h2>
  <pre>${escapeHtml(JSON.stringify(stats.dayWise, null, 2))}</pre>
  <h2>Leaderboard</h2>
  <table border="1" cellpadding="6" style="border-collapse:collapse">
    <tr><th>Player</th><th>Branch</th><th>Day</th><th>Score</th><th>Status</th></tr>
    ${rows(stats.leaderboard)}
  </table>
  <h2>Top players</h2>
  <table border="1" cellpadding="6" style="border-collapse:collapse">
    <tr><th>Player</th><th>Branch</th><th>Day</th><th>Score</th><th>Status</th></tr>
    ${rows(stats.topPlayers)}
  </table>
  <h2>Active / recent participants</h2>
  <table border="1" cellpadding="6" style="border-collapse:collapse">
    <tr><th>Player</th><th>Branch</th><th>Day</th><th>Score</th><th>Status</th></tr>
    ${rows(stats.active)}
  </table>
</body></html>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export async function sendWeeklyReport(stats) {
  const html = buildWeeklyReportHtml(stats);
  const subject = `MCC Codebreaker weekly report — ${stats.weekLabel}`;

  if (!hasEmailConfig()) {
    logEmail("weekly", "logged", "Email credentials absent; report logged instead of sent.");
    console.info("[email] Weekly report not sent (SMTP/EMAIL_API_KEY not configured).");
    console.info(subject);
    return { sent: false, reason: "missing_credentials" };
  }

  let nodemailer;
  try {
    nodemailer = await import("nodemailer");
  } catch {
    logEmail("weekly", "logged", "nodemailer not installed; report logged.");
    return { sent: false, reason: "nodemailer_missing" };
  }

  const transport = nodemailer.default.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpPort === 465,
    auth: {
      user: config.smtpUser || "resend",
      pass: config.smtpPass || config.emailApiKey,
    },
  });

  try {
    await transport.sendMail({
      from: config.smtpFrom,
      to: config.organizerEmail,
      subject,
      html,
    });
    logEmail("weekly", "sent", "Delivered to organizer inbox.");
    return { sent: true };
  } catch (error) {
    logEmail("weekly", "error", error.message);
    console.error("[email] Failed to send weekly report:", error.message);
    return { sent: false, reason: error.message };
  }
}
