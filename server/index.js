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
  const parts = [
    `${name}=${encodeURIComponent(value)}`
  ];

  if (options.maxAge !== undefined) {
    parts.push(
      `Max-Age=${Math.floor(options.maxAge / 1000)}`
    );
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

  return {
    status(code) {
      res.statusCode = code;
      return this;
    },

    setHeader(name, value) {
      res.setHeader(name, value);
      return this;
    },

    cookie(name, value, options = {}) {
      cookies.push(
        serializeCookie(name, value, options)
      );

      return this;
    },

    clearCookie(name, options = {}) {
      cookies.push(
        serializeCookie(name, "", {
          ...options,
          maxAge: 0,
        })
      );

      return this;
    },

    json(data) {
      if (cookies.length) {
        res.setHeader(
          "Set-Cookie",
          cookies
        );
      }

      res.setHeader(
        "Content-Type",
        "application/json; charset=utf-8"
      );

      res.end(JSON.stringify(data));
    },

    send(data) {
      if (cookies.length) {
        res.setHeader(
          "Set-Cookie",
          cookies
        );
      }

      res.end(data);
    },
  };
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

export default async function handler(req, res) {
  try {
    req.cookies = parseCookies(
      req.headers.cookie
    );

    const requestUrl = new URL(
      req.url,
      `https://${req.headers.host || "localhost"}`
    );

    req.query = Object.fromEntries(
      requestUrl.searchParams.entries()
    );

    if (
      req.body === undefined ||
      req.body === null
    ) {
      req.body = {};
    }

    const route = findRoute(
      req.method,
      requestUrl.pathname
    );

    if (route) {
      const response =
        createResponse(res);

      await runMiddleware(
        route.fns,
        req,
        response
      );

      return;
    }

    /*
     * Serve public files when requested
     */

    if (req.method === "GET") {
      let requestedPath =
        requestUrl.pathname;

      if (requestedPath === "/") {
        requestedPath = "/index.html";
      }

      const cleanPath = path
        .normalize(requestedPath)
        .replace(/^[/\\]+/, "");

      const filePath = path.join(
        ROOT,
        "public",
        cleanPath
      );

      if (
        filePath.startsWith(
          path.join(ROOT, "public")
        ) &&
        fs.existsSync(filePath) &&
        fs.statSync(filePath).isFile()
      ) {
        const extension =
          path.extname(filePath)
            .toLowerCase();

        const mime = {
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

        res.setHeader(
          "Content-Type",
          mime[extension] ||
            "application/octet-stream"
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
        path: requestUrl.pathname,
      })
    );
  } catch (error) {
    console.error(
      "Vercel function error:",
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
            error?.message ||
            "Internal server error.",
        })
      );
    }
  }
}
