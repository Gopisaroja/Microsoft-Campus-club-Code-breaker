import fs from "node:fs";
import path from "node:path";
import { URL } from "node:url";

import { config, ROOT } from "../server/config.js";
import { ensureDailyChallenge, getDb } from "../server/db.js";
import { mountRoutes } from "../server/routes.js";

getDb();
ensureDailyChallenge();

const handlers = [];

function app() {}

app.get = (route, ...fns) => {
  handlers.push({
    method: "GET",
    route,
    fns,
  });
};

app.post = (route, ...fns) => {
  handlers.push({
    method: "POST",
    route,
    fns,
  });
};

app.use = () => {};

mountRoutes(app);

function parseCookies(header) {
  const out = {};

  for (
    const part of String(header || "").split(";")
  ) {
    const idx = part.indexOf("=");

    if (idx === -1) continue;

    out[
      part.slice(0, idx).trim()
    ] = decodeURIComponent(
      part.slice(idx + 1).trim()
    );
  }

  return out;
}

function serializeCookie(
  name,
  value,
  options = {}
) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
  ];

  if (options.maxAge !== undefined) {
    parts.push(
      `Max-Age=${Math.floor(
        options.maxAge / 1000
      )}`
    );
  }

  if (options.path) {
    parts.push(`Path=${options.path}`);
  }

  if (options.sameSite) {
    parts.push(
      `SameSite=${options.sameSite}`
    );
  }

  if (options.httpOnly) {
    parts.push("HttpOnly");
  }

  if (options.secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function wrapRes(res) {
  const cookies = [];

  const api = {
    headersSent: false,

    status(code) {
      res.statusCode = code;
      return api;
    },

    setHeader(key, value) {
      res.setHeader(key, value);
      return api;
    },

    json(payload) {
      res.setHeader(
        "Content-Type",
        "application/json; charset=utf-8"
      );

      if (cookies.length) {
        res.setHeader(
          "Set-Cookie",
          cookies
        );
      }

      res.end(
        JSON.stringify(payload)
      );
    },

    send(body) {
      if (cookies.length) {
        res.setHeader(
          "Set-Cookie",
          cookies
        );
      }

      res.end(body);
    },

    cookie(name, value, options) {
      cookies.push(
        serializeCookie(
          name,
          value,
          options
        )
      );

      return api;
    },

    clearCookie(name, options) {
      cookies.push(
        serializeCookie(
          name,
          "",
          {
            ...options,
            maxAge: 0,
          }
        )
      );

      return api;
    },
  };

  return api;
}

function matchRoute(
  method,
  pathname
) {
  return handlers.find(
    (h) =>
      h.method === method &&
      h.route === pathname
  );
}

async function runMiddleware(
  fns,
  req,
  res
) {
  let i = 0;

  const next = async () => {
    const fn = fns[i];

    i += 1;

    if (!fn) return;

    await fn(req, res, next);
  };

  return next();
}

export default async function handler(
  req,
  res
) {
  try {
    res.setHeader(
      "X-Content-Type-Options",
      "nosniff"
    );

    res.setHeader(
      "Referrer-Policy",
      "same-origin"
    );

    const url = new URL(
      req.url,
      `https://${req.headers.host || "localhost"}`
    );

    req.cookies = parseCookies(
      req.headers.cookie
    );

    req.query =
      Object.fromEntries(
        url.searchParams.entries()
      );

    if (
      req.body === undefined ||
      req.body === null
    ) {
      req.body = {};
    }

    const hit = matchRoute(
      req.method,
      url.pathname
    );

    if (hit) {
      const wrappedRes =
        wrapRes(res);

      await runMiddleware(
        hit.fns,
        req,
        wrappedRes
      );

      return;
    }

    if (
      req.method === "GET"
    ) {
      const safe = path
        .normalize(url.pathname)
        .replace(/^[/\\]+/, "");

      const filePath = path.join(
        ROOT,
        "public",
        safe
      );

      if (
        safe &&
        fs.existsSync(filePath) &&
        fs.statSync(filePath).isFile()
      ) {
        res.setHeader(
          "Content-Type",
          getMimeType(filePath)
        );

        fs.createReadStream(
          filePath
        ).pipe(res);

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
        error: "Not found.",
      })
    );
  } catch (error) {
    console.error(
      "Vercel API error:",
      error
    );

    if (!res.headersSent) {
      res.statusCode = 500;

      res.setHeader(
        "Content-Type",
        "application/json; charset=utf-8"
      );

      res.end(
        JSON.stringify({
          error:
            "Internal server error.",
        })
      );
    }
  }
}

function getMimeType(filePath) {
  const ext =
    path
      .extname(filePath)
      .toLowerCase();

  const types = {
    ".html":
      "text/html; charset=utf-8",

    ".css":
      "text/css; charset=utf-8",

    ".js":
      "text/javascript; charset=utf-8",

    ".json":
      "application/json; charset=utf-8",

    ".png":
      "image/png",

    ".jpg":
      "image/jpeg",

    ".jpeg":
      "image/jpeg",

    ".svg":
      "image/svg+xml",

    ".ico":
      "image/x-icon",
  };

  return (
    types[ext] ||
    "application/octet-stream"
  );
}
