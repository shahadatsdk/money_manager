// ======================== Money Manager - Storage Layer ========================
// Persists every user action and a full mirror of the app data into three sinks:
//
//   1. data/activity-log.jsonl  — append-only audit trail (one JSON object per line)
//   2. data/snapshot.json       — latest full data mirror (users/categories/transactions/budgets)
//   3. MySQL                    — the same records in real tables, enabled only when the
//                                 MYSQL_* environment variables are set (see .env.example)
//
// The JSON sinks are always active so the app keeps an audit trail with zero setup.
// MySQL is optional: if it is not configured (or mysql2 is missing / unreachable)
// the API still succeeds and reports the MySQL state in /api/health.

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const ACTIVITY_FILE = path.join(DATA_DIR, "activity-log.jsonl");
const SNAPSHOT_FILE = path.join(DATA_DIR, "snapshot.json");

// ---------------------------------------------------------------- env loading
// Tiny .env reader so the server can be started with `npm run dev` and pick up
// MySQL credentials without an extra dependency. Real environment variables win.
function loadDotEnv() {
  const file = path.join(ROOT, ".env");
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (_) {
    return false;
  }
  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed);
    if (!match) return;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  });
  return true;
}
const dotEnvLoaded = loadDotEnv();

function ensureDataDir() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (_) {
    /* already exists */
  }
}

// ---------------------------------------------------------------- value helpers
function toDateTime(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function toDateOnly(value) {
  if (!value) return null;
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function toUserId(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && Number.isSafeInteger(Math.trunc(n)) ? Math.trunc(n) : null;
}

function toAmount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function toText(value, max) {
  if (value === null || value === undefined) return null;
  const s = String(value);
  return max ? s.slice(0, max) : s;
}

// ---------------------------------------------------------------- JSON sinks
async function appendActivityJson(records) {
  ensureDataDir();
  const payload = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
  await fsp.appendFile(ACTIVITY_FILE, payload, "utf8");
}

async function readActivityJson({ limit = 100, userId = null } = {}) {
  let text;
  try {
    text = await fsp.readFile(ACTIVITY_FILE, "utf8");
  } catch (_) {
    return [];
  }
  const rows = [];
  const lines = text.split("\n");
  // Walk backwards so we only parse what we need from big files.
  for (let i = lines.length - 1; i >= 0 && rows.length < limit; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch (_) {
      continue;
    }
    if (userId !== null && String(record.user_id) !== String(userId)) continue;
    rows.push(record);
  }
  return rows; // newest first
}

function emptySnapshot() {
  return { app_name: "Money Manager", generated_at: null, users: {} };
}

async function readSnapshotJson() {
  try {
    const text = await fsp.readFile(SNAPSHOT_FILE, "utf8");
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && parsed.users) return parsed;
    return emptySnapshot();
  } catch (_) {
    return emptySnapshot();
  }
}

async function writeSnapshotJson(snapshot) {
  ensureDataDir();
  const tmp = SNAPSHOT_FILE + ".tmp";
  await fsp.writeFile(tmp, JSON.stringify(snapshot, null, 2), "utf8");
  await fsp.rename(tmp, SNAPSHOT_FILE); // atomic replace
}

// ---------------------------------------------------------------- MySQL
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
     id BIGINT NOT NULL PRIMARY KEY,
     name VARCHAR(120) NOT NULL,
     mobile VARCHAR(32) NOT NULL,
     created_at DATETIME NULL,
     UNIQUE KEY uq_users_mobile (mobile)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS categories (
     id VARCHAR(64) NOT NULL PRIMARY KEY,
     user_id BIGINT NULL,
     name VARCHAR(120) NOT NULL,
     type VARCHAR(16) NOT NULL DEFAULT 'both',
     icon VARCHAR(48) NULL,
     color VARCHAR(16) NULL,
     created_at DATETIME NULL,
     KEY idx_categories_user (user_id)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS transactions (
     id VARCHAR(64) NOT NULL PRIMARY KEY,
     user_id BIGINT NULL,
     type VARCHAR(16) NOT NULL,
     category VARCHAR(64) NOT NULL,
     amount DECIMAL(14,2) NOT NULL DEFAULT 0,
     date DATE NULL,
     description TEXT NULL,
     created_at DATETIME NULL,
     KEY idx_transactions_user (user_id),
     KEY idx_transactions_date (date)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS budgets (
     id VARCHAR(64) NOT NULL PRIMARY KEY,
     user_id BIGINT NULL,
     category VARCHAR(64) NOT NULL,
     amount DECIMAL(14,2) NOT NULL DEFAULT 0,
     month VARCHAR(7) NOT NULL DEFAULT '',
     created_at DATETIME NULL,
     KEY idx_budgets_user (user_id)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS activity_log (
     id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
     record_id VARCHAR(64) NOT NULL,
     user_id BIGINT NULL,
     user_name VARCHAR(120) NULL,
     action VARCHAR(64) NOT NULL,
     entity VARCHAR(48) NULL,
     entity_id VARCHAR(64) NULL,
     details JSON NULL,
     platform VARCHAR(32) NULL,
     created_at DATETIME NOT NULL,
     UNIQUE KEY uq_activity_record (record_id),
     KEY idx_activity_user (user_id),
     KEY idx_activity_created (created_at)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

const mysqlState = {
  enabled: false,
  ready: false,
  error: null,
  pool: null,
  schemaPromise: null,
};

function mysqlConfig() {
  const { MYSQL_HOST, MYSQL_USER, MYSQL_DATABASE } = process.env;
  if (!MYSQL_HOST || !MYSQL_USER || !MYSQL_DATABASE) return null;
  return {
    host: MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: MYSQL_USER,
    password: process.env.MYSQL_PASSWORD || "",
    database: MYSQL_DATABASE,
    connectionLimit: Number(process.env.MYSQL_POOL_SIZE) || 5,
    waitForConnections: true,
    charset: "utf8mb4",
    // DATETIME columns hold UTC wall-clock values (see toDateTime); telling the
    // driver so keeps writes and reads in the same timezone.
    timezone: "Z",
  };
}

function getPool() {
  if (mysqlState.pool || mysqlState.error) return mysqlState.pool;
  const config = mysqlConfig();
  if (!config) {
    mysqlState.enabled = false;
    return null;
  }
  let mysql;
  try {
    mysql = require("mysql2/promise");
  } catch (err) {
    mysqlState.error = "mysql2 is not installed (run: npm install mysql2)";
    return null;
  }
  mysqlState.enabled = true;
  mysqlState.pool = mysql.createPool(config);
  return mysqlState.pool;
}

// Creates the tables once per process. Resolves to the pool (or null).
async function ensureSchema() {
  const pool = getPool();
  if (!pool) return null;
  if (mysqlState.schemaPromise) return mysqlState.schemaPromise;

  mysqlState.schemaPromise = (async () => {
    try {
      for (const statement of SCHEMA) await pool.query(statement);
      mysqlState.ready = true;
      mysqlState.error = null;
      return pool;
    } catch (err) {
      mysqlState.ready = false;
      mysqlState.error = err.message;
      mysqlState.schemaPromise = null; // allow a retry on the next request
      return null;
    }
  })();
  return mysqlState.schemaPromise;
}

async function mysqlInsertActivity(pool, records) {
  if (!records.length) return 0;
  const values = records.map((r) => [
    String(r.id).slice(0, 64),
    toUserId(r.user_id),
    toText(r.user_name, 120),
    toText(r.action, 64) || "unknown",
    toText(r.entity, 48),
    toText(r.entity_id, 64),
    r.details === undefined || r.details === null ? null : JSON.stringify(r.details),
    toText(r.platform, 32),
    toDateTime(r.created_at) || toDateTime(new Date()),
  ]);
  // INSERT IGNORE keeps retried batches idempotent (record_id is unique).
  const [result] = await pool.query(
    `INSERT IGNORE INTO activity_log
       (record_id, user_id, user_name, action, entity, entity_id, details, platform, created_at)
     VALUES ?`,
    [values]
  );
  return result.affectedRows || 0;
}

async function mysqlReadActivity(pool, { limit = 100, userId = null } = {}) {
  const params = [];
  let where = "";
  if (userId !== null) {
    where = "WHERE user_id = ?";
    params.push(toUserId(userId));
  }
  params.push(limit);
  const [rows] = await pool.query(
    `SELECT record_id AS id, user_id, user_name, action, entity, entity_id, details,
            platform, created_at
       FROM activity_log ${where}
      ORDER BY id DESC
      LIMIT ?`,
    params
  );
  return rows.map((row) => ({
    ...row,
    details: typeof row.details === "string" ? safeJson(row.details) : row.details,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  }));
}

function safeJson(value) {
  try {
    return JSON.parse(value);
  } catch (_) {
    return value;
  }
}

// Replaces the MySQL rows for one user with exactly what the client sent, so the
// database is a mirror rather than an ever-growing append log.
async function mysqlMirrorUser(pool, { user, categories, transactions, budgets }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    if (user && toUserId(user.id) !== null) {
      await conn.query(
        `INSERT INTO users (id, name, mobile, created_at)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), mobile = VALUES(mobile)`,
        [
          toUserId(user.id),
          toText(user.name, 120) || "User",
          toText(user.mobile, 32) || "",
          toDateTime(user.created_at) || toDateTime(new Date()),
        ]
      );
    }

    const userId = toUserId(user && user.id);

    const catValues = (categories || []).map((c) => [
      String(c.id).slice(0, 64),
      toUserId(c.user_id) !== null ? toUserId(c.user_id) : userId,
      toText(c.name, 120) || "Category",
      toText(c.type, 16) || "both",
      toText(c.icon, 48),
      toText(c.color, 16),
      toDateTime(c.created_at),
    ]);
    if (catValues.length) {
      await conn.query(
        `INSERT INTO categories (id, user_id, name, type, icon, color, created_at)
         VALUES ? ON DUPLICATE KEY UPDATE
           name = VALUES(name), type = VALUES(type), icon = VALUES(icon),
           color = VALUES(color), user_id = VALUES(user_id)`,
        [catValues]
      );
    }
    await conn.query(
      catValues.length
        ? "DELETE FROM categories WHERE user_id = ? AND id NOT IN (?)"
        : "DELETE FROM categories WHERE user_id = ?",
      catValues.length ? [userId, catValues.map((v) => v[0])] : [userId]
    );

    const txnValues = (transactions || []).map((t) => [
      String(t.id).slice(0, 64),
      toUserId(t.user_id) !== null ? toUserId(t.user_id) : userId,
      toText(t.type, 16) || "expense",
      toText(t.category, 64) || "other",
      toAmount(t.amount),
      toDateOnly(t.date),
      toText(t.description) || "",
      toDateTime(t.created_at),
    ]);
    if (txnValues.length) {
      await conn.query(
        `INSERT INTO transactions (id, user_id, type, category, amount, date, description, created_at)
         VALUES ? ON DUPLICATE KEY UPDATE
           type = VALUES(type), category = VALUES(category), amount = VALUES(amount),
           date = VALUES(date), description = VALUES(description), user_id = VALUES(user_id)`,
        [txnValues]
      );
    }
    await conn.query(
      txnValues.length
        ? "DELETE FROM transactions WHERE user_id = ? AND id NOT IN (?)"
        : "DELETE FROM transactions WHERE user_id = ?",
      txnValues.length ? [userId, txnValues.map((v) => v[0])] : [userId]
    );

    const budgetValues = (budgets || []).map((b) => [
      String(b.id).slice(0, 64),
      toUserId(b.user_id) !== null ? toUserId(b.user_id) : userId,
      toText(b.category, 64) || "other",
      toAmount(b.amount),
      toText(b.month, 7) || "",
      toDateTime(b.created_at),
    ]);
    if (budgetValues.length) {
      await conn.query(
        `INSERT INTO budgets (id, user_id, category, amount, month, created_at)
         VALUES ? ON DUPLICATE KEY UPDATE
           category = VALUES(category), amount = VALUES(amount),
           month = VALUES(month), user_id = VALUES(user_id)`,
        [budgetValues]
      );
    }
    await conn.query(
      budgetValues.length
        ? "DELETE FROM budgets WHERE user_id = ? AND id NOT IN (?)"
        : "DELETE FROM budgets WHERE user_id = ?",
      budgetValues.length ? [userId, budgetValues.map((v) => v[0])] : [userId]
    );

    await conn.commit();
    return {
      categories: catValues.length,
      transactions: txnValues.length,
      budgets: budgetValues.length,
    };
  } catch (err) {
    try {
      await conn.rollback();
    } catch (_) {
      /* ignore */
    }
    throw err;
  } finally {
    conn.release();
  }
}

// ---------------------------------------------------------------- public API
async function recordActivity(records) {
  const list = (Array.isArray(records) ? records : []).filter(
    (r) => r && typeof r === "object" && r.action
  );
  if (!list.length) return { json: 0, mysql: { enabled: mysqlState.enabled, inserted: 0 } };

  const normalized = list.map((r) => ({
    id: String(r.id || `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
    user_id: toUserId(r.user_id),
    user_name: toText(r.user_name, 120),
    action: toText(r.action, 64),
    entity: toText(r.entity, 48),
    entity_id: toText(r.entity_id, 64),
    details: r.details === undefined ? null : r.details,
    platform: toText(r.platform, 32),
    created_at: r.created_at || new Date().toISOString(),
  }));

  await appendActivityJson(normalized);
  const result = { json: normalized.length, mysql: { enabled: false, inserted: 0, error: null } };

  const pool = await ensureSchema();
  if (pool) {
    result.mysql.enabled = true;
    try {
      result.mysql.inserted = await mysqlInsertActivity(pool, normalized);
    } catch (err) {
      result.mysql.error = err.message;
    }
  } else {
    result.mysql.enabled = mysqlState.enabled;
    result.mysql.error = mysqlState.error;
  }
  return result;
}

async function readActivity(options = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || 100, 1), 1000);
  const userId = options.userId === undefined ? null : options.userId;
  const pool = await ensureSchema();
  if (pool) {
    try {
      const rows = await mysqlReadActivity(pool, { limit, userId });
      if (rows.length) return { source: "mysql", records: rows.reverse() };
    } catch (err) {
      mysqlState.error = err.message;
    }
  }
  const rows = await readActivityJson({ limit, userId });
  return { source: "json", records: rows.reverse() };
}

async function mirrorSnapshot(payload) {
  const user = payload && payload.user ? payload.user : null;
  const userId = user ? toUserId(user.id) : null;
  if (userId === null) throw new Error("payload.user.id is required");

  const snapshot = await readSnapshotJson();
  snapshot.generated_at = new Date().toISOString();
  snapshot.users[String(userId)] = {
    profile: {
      id: userId,
      name: toText(user.name, 120),
      mobile: toText(user.mobile, 32),
      // Never mirror password hashes: they stay only in the local database.
    },
    categories: Array.isArray(payload.categories) ? payload.categories : [],
    transactions: Array.isArray(payload.transactions) ? payload.transactions : [],
    budgets: Array.isArray(payload.budgets) ? payload.budgets : [],
    updated_at: snapshot.generated_at,
  };
  await writeSnapshotJson(snapshot);

  const result = {
    user_id: userId,
    json: {
      path: path.relative(ROOT, SNAPSHOT_FILE).replace(/\\/g, "/"),
      transactions: snapshot.users[String(userId)].transactions.length,
      budgets: snapshot.users[String(userId)].budgets.length,
      categories: snapshot.users[String(userId)].categories.length,
    },
    mysql: { enabled: false, error: null },
  };

  const pool = await ensureSchema();
  if (pool) {
    result.mysql.enabled = true;
    try {
      result.mysql.rows = await mysqlMirrorUser(pool, {
        user,
        categories: payload.categories,
        transactions: payload.transactions,
        budgets: payload.budgets,
      });
    } catch (err) {
      result.mysql.error = err.message;
    }
  } else {
    result.mysql.enabled = mysqlState.enabled;
    result.mysql.error = mysqlState.error;
  }
  return result;
}

async function health() {
  const pool = await ensureSchema();
  const info = {
    ok: true,
    json: {
      activity_log: path.relative(ROOT, ACTIVITY_FILE).replace(/\\/g, "/"),
      snapshot: path.relative(ROOT, SNAPSHOT_FILE).replace(/\\/g, "/"),
      dotenv: dotEnvLoaded,
    },
    mysql: {
      enabled: mysqlState.enabled || Boolean(mysqlConfig()),
      ready: Boolean(pool) && mysqlState.ready,
      error: mysqlState.error,
      host: process.env.MYSQL_HOST || null,
      database: process.env.MYSQL_DATABASE || null,
    },
  };
  if (pool) {
    try {
      const [counts] = await pool.query(
        `SELECT
           (SELECT COUNT(*) FROM activity_log) AS activity_rows,
           (SELECT COUNT(*) FROM transactions) AS transaction_rows,
           (SELECT COUNT(*) FROM users) AS user_rows`
      );
      info.mysql.counts = counts[0];
    } catch (err) {
      info.mysql.error = err.message;
    }
  }
  return info;
}

module.exports = {
  DATA_DIR,
  ACTIVITY_FILE,
  SNAPSHOT_FILE,
  recordActivity,
  readActivity,
  mirrorSnapshot,
  readSnapshotJson,
  health,
};
