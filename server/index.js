import fs from "node:fs";
import path from "node:path";

import { ROOT } from "../server/config.js";
import { ensureDailyChallenge, getDb } from "../server/db.js";
import { mountRoutes } from "../server/routes.js";

getDb();
ensureDailyChallenge();

const handlers = [];

const app = {};

app.get = (route, ...fns) => {
  handlers.push({ method: "GET", route, fns });
};

app.post = (route, ...fns) => {
  handlers.push({ method: "POST", route, fns });
};

app.use = () => {};

mountRoutes(app);

function parseCookies(header) {
  const cookies = {};

  for (const part of String(header || "").split(";")) {
    const index = part.indexOf("=");

    if (index === -1) continue;

    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();

    cookies[name] = decodeURIComponent(value);
  }

  return cookies;
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${Math.floor(options.maxAge / 1000)}`);
  }

  if (options.path) {
    parts.push(`Path=${options.path}`);
  }

  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite}`);
  }

  if (options.httpOnly) {
    parts.push("HttpOnly");
  }

  if (options.secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function createResponse(res) {
  const cookies = [];

  const response = {
    headersSent: false,

    status(code) {
      res.statusCode = code;
      return response;
    },

    setHeader(name, value) {
      res.setHeader(name, value);
      return response;
    },

    cookie(name, value, options = {}) {
      cookies.push(
        serializeCookie(name, value, options)
      );

      return response;
    },

    clearCookie(name, options = {}) {
      cookies.push(
        serializeCookie(name, "", {
          ...options,
          maxAge: 0
        })
      );

      return response;
    },

    json(data) {
      if (cookies.length) {
        res.setHeader("Set-Cookie", cookies);
      }

      res.setHeader(
        "Content-Type",
        "application/json; charset=utf-8"
      );

      res.end(JSON.stringify(data));

      response.headersSent = true;
    },

    send(data) {
      if (cookies.length) {
        res.setHeader("Set-Cookie", cookies);
      }

      res.end(data);

      response.headersSent = true;
    }
  };

  return response;
}

async function runMiddleware(fns, req, res) {
  let index = 0;

  const next = async () => {
    const fn = fns[index++];

    if (!fn) return;

    await fn(req, res, next);
  };

  await next();
}

function findRoute(method, pathname) {
  return handlers.find(
    (handler) =>
      handler.method === method &&
      handler.route === pathname
  );
}

function mimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon"
  };

  return types[ext] || "application/octet-stream";
}

export default async function handler(req, res) {
  try {
    const requestUrl = new URL(
      req.url || "/",
      `https://${req.headers.host || "localhost"}`
    );

    req.cookies = parseCookies(req.headers.cookie);

    req.query = Object.fromEntries(
      requestUrl.searchParams.entries()
    );

    if (!req.body) {
      req.body = {};
    }

    const pathname = requestUrl.pathname;

    /*
     * IMPORTANT:
     * Vercel rewrite preserves the original
     * /api/register, /api/me, etc. pathname.
     */

    const route = findRoute(req.method, pathname);

    if (route) {
      const response = createResponse(res);

      await runMiddleware(
        route.fns,
        req,
        response
      );

      return;
    }

    /*
     * Static files
     */

    if (req.method === "GET") {
      let requestedPath = pathname;

      if (requestedPath === "/") {
        requestedPath = "/index.html";
      }

      const cleanPath = path
        .normalize(requestedPath)
        .replace(/^[/\\]+/, "");

      const publicRoot = path.join(ROOT, "public");

      const filePath = path.join(
        publicRoot,
        cleanPath
      );

      if (
        filePath.startsWith(publicRoot) &&
        fs.existsSync(filePath) &&
        fs.statSync(filePath).isFile()
      ) {
        res.statusCode = 200;

        res.setHeader(
          "Content-Type",
          mimeType(filePath)
        );

        fs.createReadStream(filePath).pipe(res);

        return;
      }
    }

    res.statusCode = 404;

    res.setHeader(
      "Content-Type",
      "application/json; charset=utf-8"
    );

    res.end(
      JSON.stringify({
        error: "Not found",
        path: pathname
      })
    );
  } catch (error) {
    console.error("Vercel function error:", error);

    if (!res.headersSent) {
      res.statusCode = 500;

      res.setHeader(
        "Content-Type",
        "application/json; charset=utf-8"
      );

      res.end(
        JSON.stringify({
          error: error.message || "Internal server error"
        })
      );
    }
  }
}
