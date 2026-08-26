import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { URL } from "node:url";
import { config, ROOT } from "./config.js";
import { ensureDailyChallenge, getDb } from "./db.js";
import { mountRoutes, collectStats } from "./routes.js";
import { sendWeeklyReport } from "./email.js";
import { nowInTimezone } from "./challenge.js";

getDb();
ensureDailyChallenge();

const handlers = [];

function app() {}
app.get = (route, ...fns) => handlers.push({ method: "GET", route, fns });
app.post = (route, ...fns) => handlers.push({ method: "POST", route, fns });
app.use = () => {};

mountRoutes(app);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json",
};

function parseCookies(header) {
  const out = {};
  for (const part of String(header || "").split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge) parts.push(`Max-Age=${Math.floor(options.maxAge / 1000)}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

function wrapRes(nodeRes) {
  const cookies = [];
  const api = {
    headersSent: false,
    status(code) {
      nodeRes.statusCode = code;
      return api;
    },
    setHeader(key, value) {
      nodeRes.setHeader(key, value);
      return api;
    },
    json(payload) {
      nodeRes.setHeader("Content-Type", "application/json; charset=utf-8");
      if (cookies.length) nodeRes.setHeader("Set-Cookie", cookies);
      nodeRes.end(JSON.stringify(payload));
    },
    send(body) {
      if (cookies.length) nodeRes.setHeader("Set-Cookie", cookies);
      nodeRes.end(body);
    },
    cookie(name, value, options) {
      cookies.push(serializeCookie(name, value, options));
      return api;
    },
    clearCookie(name, options) {
      cookies.push(serializeCookie(name, "", { ...options, maxAge: 0 }));
      return api;
    },
  };
  return api;
}

function matchRoute(method, pathname) {
  return handlers.find((h) => h.method === method && h.route === pathname);
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
  fs.createReadStream(filePath).pipe(res);
}

function runMiddleware(fns, req, res) {
  let i = 0;
  const next = async () => {
    const fn = fns[i];
    i += 1;
    if (!fn) return;
    await fn(req, res, next);
  };
  return next();
}

const server = http.createServer(async (nodeReq, nodeRes) => {
  nodeRes.setHeader("X-Content-Type-Options", "nosniff");
  nodeRes.setHeader("Referrer-Policy", "same-origin");
  const url = new URL(nodeReq.url, `http://${nodeReq.headers.host || "localhost"}`);
  const req = nodeReq;
  req.cookies = parseCookies(nodeReq.headers.cookie);
  req.query = Object.fromEntries(url.searchParams.entries());
  req.body = {};
  const res = wrapRes(nodeRes);

  if (["POST", "PUT", "PATCH"].includes(nodeReq.method)) {
    const chunks = [];
    for await (const chunk of nodeReq) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8");
    if (raw) {
      try {
        req.body = JSON.parse(raw);
      } catch {
        res.status(400).json({ error: "Invalid JSON body." });
        return;
      }
    }
  }

  const hit = matchRoute(nodeReq.method, url.pathname);
  if (hit) {
    try {
      await runMiddleware(hit.fns, req, res);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Server error." });
    }
    return;
  }

  if (nodeReq.method === "GET") {
    const safe = path.normalize(url.pathname).replace(/^[/\\]+/, "");
    const filePath = path.join(ROOT, "public", safe);
    if (safe && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      sendFile(nodeRes, filePath);
      return;
    }
    sendFile(nodeRes, path.join(ROOT, "public", "index.html"));
    return;
  }

  res.status(404).json({ error: "Not found." });
});

let lastWeeklyKey = "";
setInterval(() => {
  const stamp = nowInTimezone();
  if (stamp.weekday === "Mon" && stamp.hour === 9 && stamp.minute === 0) {
    if (lastWeeklyKey === stamp.date) return;
    lastWeeklyKey = stamp.date;
    sendWeeklyReport(collectStats()).catch((error) => {
      console.error("[cron] weekly report failed:", error.message);
    });
  }
}, 30000);

server.listen(config.port, () => {
  console.log(`MCC Codebreaker running on http://localhost:${config.port}`);
});
