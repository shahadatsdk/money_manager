// Static file server for frontend/ + a small JSON API for activity logging and
// MySQL mirroring. No framework, one optional dependency (mysql2).
// Run with: npm run dev
const http = require("http");
const fs = require("fs");
const path = require("path");

const store = require("./server/store");

const args = process.argv.slice(2);
const portFlagIndex = args.findIndex((arg) => arg === "--port" || arg === "-p");
const portArg =
  portFlagIndex !== -1 && args[portFlagIndex + 1]
    ? args[portFlagIndex + 1]
    : args.find((arg) => arg.startsWith("--port="))?.split("=")[1];

const PORT = Number(process.env.PORT || portArg) || 5174;
// Set HOST=0.0.0.0 to expose the server to other devices on the LAN
// (e.g. open the app on a phone at http://<this-machine-ip>:PORT).
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = path.join(__dirname, "frontend");
const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5 MB — full data imports fit comfortably

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".apk": "application/vnd.android.package-archive",
};

// ---------------------------------------------------------------- API helpers
function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    // The app also runs from a Capacitor WebView (origin capacitor://localhost),
    // so API responses must be readable cross-origin when a phone uses this server.
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (err) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

// ---------------------------------------------------------------- API routes
async function handleApi(req, res, pathname, query) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Max-Age": "600",
    });
    return res.end();
  }

  try {
    if (pathname === "/api/health" && req.method === "GET") {
      return sendJson(res, 200, await store.health());
    }

    // ---- activity log: append (JSON file + MySQL) -------------------------
    if (pathname === "/api/activity" && req.method === "POST") {
      const body = await readJsonBody(req);
      const records = Array.isArray(body) ? body : body.records;
      if (!Array.isArray(records)) {
        return sendJson(res, 400, { ok: false, error: "records[] is required" });
      }
      const result = await store.recordActivity(records);
      console.log(
        `[api] activity +${result.json} record(s) → json${
          result.mysql.enabled ? `, mysql +${result.mysql.inserted}` : ""
        }${result.mysql.error ? ` (mysql: ${result.mysql.error})` : ""}`
      );
      return sendJson(res, 200, { ok: true, ...result });
    }

    // ---- activity log: read (MySQL when available, else JSON) -------------
    if (pathname === "/api/activity" && req.method === "GET") {
      const limit = query.get("limit") || "100";
      const userId = query.has("user_id") ? query.get("user_id") : null;
      const result = await store.readActivity({ limit, userId });
      return sendJson(res, 200, { ok: true, ...result });
    }

    // ---- full data mirror (users/categories/transactions/budgets) ---------
    if (pathname === "/api/sync" && req.method === "POST") {
      const body = await readJsonBody(req);
      if (!body || !body.user || body.user.id === undefined) {
        return sendJson(res, 400, { ok: false, error: "user.id is required" });
      }
      const result = await store.mirrorSnapshot(body);
      console.log(
        `[api] sync user ${result.user_id} → json (${result.json.transactions} txns, ` +
          `${result.json.budgets} budgets, ${result.json.categories} cats)` +
          (result.mysql.enabled
            ? `, mysql ok${result.mysql.error ? ` (${result.mysql.error})` : ""}`
            : "")
      );
      return sendJson(res, 200, { ok: true, ...result });
    }

    if (pathname === "/api/snapshot" && req.method === "GET") {
      return sendJson(res, 200, { ok: true, snapshot: await store.readSnapshotJson() });
    }

    return sendJson(res, 404, { ok: false, error: "Unknown API endpoint" });
  } catch (err) {
    console.error("[api] error:", err.message);
    return sendJson(res, 500, { ok: false, error: err.message });
  }
}

// ---------------------------------------------------------------- HTTP server
http
  .createServer((req, res) => {
    const parsed = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = decodeURIComponent(parsed.pathname);

    if (pathname.startsWith("/api/")) {
      handleApi(req, res, pathname, parsed.searchParams);
      return;
    }

    let urlPath = pathname;
    if (urlPath === "/") urlPath = "/index.html";
    const filePath = path.join(ROOT, path.normalize(urlPath));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403);
      return res.end("Forbidden");
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        return res.end("Not found");
      }
      res.writeHead(200, {
        "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(data);
    });
  })
  .listen(PORT, HOST, () => {
    console.log(`Preview server running at http://localhost:${PORT} (bound to ${HOST})`);
    console.log(`Activity log → ${path.relative(__dirname, store.ACTIVITY_FILE)}`);
    console.log(`Data snapshot → ${path.relative(__dirname, store.SNAPSHOT_FILE)}`);
    console.log(
      `MySQL → ${
        process.env.MYSQL_HOST && process.env.MYSQL_DATABASE
          ? `${process.env.MYSQL_USER || "root"}@${process.env.MYSQL_HOST}/${process.env.MYSQL_DATABASE}`
          : "not configured (JSON only; set MYSQL_* in .env)"
      }`
    );
  });
