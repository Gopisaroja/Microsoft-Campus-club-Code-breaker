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
    fns
  });
};

app.post = (route, ...fns) => {
  handlers.push({
    method: "POST",
    route,
    fns
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

  parts.push(`Path=${options.path || "/"}`);

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

  async function next() {
    const fn = fns[index++];

    if (!fn) return;

    await fn(req, res, next);
  }

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
    const url = new URL(
      req.url || "/",
      `https://${req.headers.host || "localhost"}`
    );

    req.cookies = parseCookies(
      req.headers.cookie
    );

    req.query = Object.fromEntries(
      url.searchParams.entries()
    );

    if (!req.body) {
      req.body = {};
    }

    const route = findRoute(
      req.method,
      url.pathname
    );

    if (!route) {
      res.statusCode = 404;

      res.setHeader(
        "Content-Type",
        "application/json; charset=utf-8"
      );

      res.end(
        JSON.stringify({
          error: "API route not found",
          path: url.pathname
        })
      );

      return;
    }

    const response = createResponse(res);

    await runMiddleware(
      route.fns,
      req,
      response
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
            error.message ||
            "Internal server error"
        })
      );
    }
  }
}
