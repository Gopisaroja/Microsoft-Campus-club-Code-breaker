import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..");

function parseEnvFile() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const idx = trimmed.indexOf("=");
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === "") process.env[key] = value;
  }
}

parseEnvFile();

function env(name, fallback = "") {
  const value = process.env[name];
  return value == null || value === "" ? fallback : value;
}

export const config = {
  port: Number(env("PORT", "3000")),
  nodeEnv: env("NODE_ENV", "development"),
  gameStartDate: env("GAME_START_DATE", "2026-08-26"),
  timezone: env("TIMEZONE", "Asia/Kolkata"),
  codeSecret: env("CODE_SECRET", "dev-only-code-secret-not-for-production"),
  sessionSecret: env("SESSION_SECRET", "dev-only-session-secret-not-for-production"),
  organizerPassword: env("ORGANIZER_PASSWORD", ""),
  organizerEmail: env("ORGANIZER_EMAIL", "gopisarojamepco2025@gmail.com"),
  emailApiKey: env("EMAIL_API_KEY", ""),
  smtpHost: env("SMTP_HOST", ""),
  smtpPort: Number(env("SMTP_PORT", "587")),
  smtpUser: env("SMTP_USER", ""),
  smtpPass: env("SMTP_PASS", ""),
  smtpFrom: env("SMTP_FROM", "MCC Codebreaker <noreply@localhost>"),
  testDayOverride: env("TEST_DAY_OVERRIDE", ""),
  dbPath: path.join("/tmp", "codebreaker.sqlite"),
  cookieSecure: env("NODE_ENV", "development") === "production",
};
