import crypto from "node:crypto";
import { config } from "./config.js";
import { getDb } from "./db.js";

const PLAYER_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const ADMIN_TTL_MS = 12 * 60 * 60 * 1000;

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

function sign(payload) {
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", config.sessionSecret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verify(token) {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", config.sessionSecret).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export function fingerprintFromFields({ fullName, branch, section, year }) {
  const raw = [fullName, branch, section, year]
    .map((v) => String(v).trim().replace(/\s+/g, " ").toLowerCase())
    .join("|");
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function sanitizeText(value, max = 80) {
  return String(value ?? "")
    .replace(/[\u0000-\u001F<>]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, max);
}

export function createPlayerToken(participantId) {
  return sign({
    t: "player",
    id: participantId,
    exp: Date.now() + PLAYER_TTL_MS,
  });
}

export function readPlayer(req) {
  const payload = verify(req.cookies?.mcc_player);
  if (!payload || payload.t !== "player" || payload.exp < Date.now()) return null;
  return payload.id;
}

export function createAdminToken() {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const now = new Date();
  const expires = new Date(now.getTime() + ADMIN_TTL_MS);
  getDb()
    .prepare("INSERT INTO admin_sessions (token_hash, created_at, expires_at) VALUES (?, ?, ?)")
    .run(tokenHash, now.toISOString(), expires.toISOString());
  return token;
}

export function isAdmin(req) {
  const token = req.cookies?.mcc_admin;
  if (!token) return false;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const row = getDb()
    .prepare("SELECT * FROM admin_sessions WHERE token_hash = ?")
    .get(tokenHash);
  if (!row) return false;
  if (Date.parse(row.expires_at) < Date.now()) return false;
  return true;
}

export function requireAdmin(req, res, next) {
  if (!isAdmin(req)) {
    return res.status(401).json({ error: "Organizer authorization required." });
  }
  return next();
}

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: config.cookieSecure,
    path: "/",
  };
}
