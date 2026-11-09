// ======================== SQLite Database Layer ========================
// On Android (native): Uses @capacitor-community/sqlite for real SQLite
// On Web (browser): Falls back to localStorage for easy testing

const DB_NAME = "money_manager.db";
// How many activity rows are kept in the web (localStorage) fallback.
const AUDIT_LOCAL_CAP = 500;

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch (_) {
    return value;
  }
}

// ---- Minimal native bridge wrapper -------------------------------------
// The @capacitor-community/sqlite ESM module cannot be resolved by the raw
// Android WebView (there is no bundler in this project), so
// import("@capacitor-community/sqlite") rejects at runtime on device and the
// app silently lost real SQLite storage. This wrapper talks to the registered
// native plugin (window.Capacitor.Plugins.CapacitorSQLite) directly and
// mirrors the request/response shapes of the plugin's own JS layer.
class MinimalSQLiteBridge {
  constructor(plugin) {
    this.plugin = plugin;
    this._connections = new Map();
  }

  async createConnection(dbName, encrypted, mode, version, readonly = false) {
    const database = dbName.endsWith(".db") ? dbName.slice(0, -3) : dbName;
    await this.plugin.createConnection({ database, encrypted, mode, version, readonly });
    const conn = new MinimalSQLiteBridgeConnection(this.plugin, database, readonly);
    this._connections.set(readonly ? `RO_${database}` : `RW_${database}`, conn);
    return conn;
  }

  async closeConnection(dbName, readonly = false) {
    const database = dbName.endsWith(".db") ? dbName.slice(0, -3) : dbName;
    await this.plugin.closeConnection({ database, readonly });
    this._connections.delete(readonly ? `RO_${database}` : `RW_${database}`);
  }
}

class MinimalSQLiteBridgeConnection {
  constructor(plugin, dbName, readonly) {
    this.plugin = plugin;
    this.dbName = dbName;
    this.readonly = !!readonly;
  }

  async open() {
    await this.plugin.open({ database: this.dbName, readonly: this.readonly });
  }

  async close() {
    await this.plugin.close({ database: this.dbName, readonly: this.readonly });
  }

  async execute(statements, transaction = true) {
    if (this.readonly) throw new Error("not allowed in read-only mode");
    return this.plugin.execute({ database: this.dbName, statements, transaction, readonly: false });
  }

  async query(statement, values) {
    return values && values.length > 0
      ? this.plugin.query({ database: this.dbName, statement, values })
      : this.plugin.query({ database: this.dbName, statement });
  }

  async run(statement, values, transaction = true) {
    if (this.readonly) throw new Error("not allowed in read-only mode");
    return values && values.length > 0
      ? this.plugin.run({ database: this.dbName, statement, values, transaction, readonly: false })
      : this.plugin.run({ database: this.dbName, statement, transaction, readonly: false });
  }
}

// Pure-JS SHA-256 (FIPS 180-4). Only used when crypto.subtle is unavailable
// (non-secure origins such as http://192.168.x.x). Output is byte-identical to
// WebCrypto's SHA-256, so hashes created in one mode verify in the other.
function sha256Hex(bytes) {
  const K = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
  ];
  const len = bytes.length;
  const padded = new Uint8Array((((len + 8) >> 6) + 1) * 64);
  padded.set(bytes);
  padded[len] = 0x80;
  const view = new DataView(padded.buffer);
  const bitLen = len * 8;
  view.setUint32(padded.length - 8, Math.floor(bitLen / 4294967296));
  view.setUint32(padded.length - 4, bitLen >>> 0);

  const H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const w = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));

  for (let off = 0; off < padded.length; off += 64) {
    for (let t = 0; t < 16; t++) w[t] = view.getUint32(off + t * 4);
    for (let t = 16; t < 64; t++) {
      const x15 = w[t - 15], x2 = w[t - 2];
      const s0 = rotr(x15, 7) ^ rotr(x15, 18) ^ (x15 >>> 3);
      const s1 = rotr(x2, 17) ^ rotr(x2, 19) ^ (x2 >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  return H.map((x) => x.toString(16).padStart(8, "0")).join("");
}

const AppDB = {
  db: null,
  isReady: false,
  useNative: false,

  // Initialize the database connection
  async init() {
    try {
      if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
        // ===== Native platform — use real SQLite =====
        const capSQLite = window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorSQLite;
        if (!capSQLite || typeof capSQLite.createConnection !== "function") {
          throw new Error("CapacitorSQLite plugin is not available on this platform");
        }
        this.useNative = true;
        let sqlite;
        try {
          // Preferred path when the ESM wrapper can be resolved (bundled builds).
          const mod = await import("@capacitor-community/sqlite");
          sqlite = new mod.SQLiteConnection(capSQLite);
        } catch (_) {
          // Raw WebView (no bundler): talk to the native plugin directly.
          sqlite = new MinimalSQLiteBridge(capSQLite);
        }
        // Recommended v6 pattern: createConnection registers the connection
        // in the plugin's connection registry (RW_/RO_ prefix), which direct
        // construction does not.
        // Guard: if the native bridge stalls, time out and fall back to
        // localStorage instead of leaving the user stuck on the loading screen.
        await Promise.race([
          (async () => {
            this.db = await sqlite.createConnection(DB_NAME, false, "no-encryption", 1, false);
            await this.db.open();
            await this.createTables();
          })(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("SQLite init timed out")), 5000)
          ),
        ]);
        console.log("AppDB: SQLite initialized (native)");
      } else {
        // ===== Web fallback — use localStorage =====
        this.useNative = false;
        console.log("AppDB: Using localStorage fallback (web)");
      }
      this.isReady = true;
    } catch (err) {
      console.error("AppDB: Init failed, using localStorage fallback", err);
      this.useNative = false;
      this.isReady = true; // Still usable via localStorage
    }
  },

  // Create SQLite tables (native only)
  async createTables() {
    const sql = `
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        mobile TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now','localtime'))
      );
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        icon TEXT DEFAULT 'bi-tag',
        color TEXT DEFAULT '#6366f1',
        created_at TEXT DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        category TEXT NOT NULL,
        amount REAL NOT NULL,
        date TEXT NOT NULL,
        description TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS budgets (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        category TEXT NOT NULL,
        amount REAL NOT NULL,
        month TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS activity_log (
        id TEXT PRIMARY KEY,
        user_id INTEGER,
        user_name TEXT,
        action TEXT NOT NULL,
        entity TEXT,
        entity_id TEXT,
        details TEXT,
        platform TEXT,
        created_at TEXT DEFAULT (datetime('now','localtime'))
      );
      CREATE INDEX IF NOT EXISTS idx_cat_user ON categories(user_id);
      CREATE INDEX IF NOT EXISTS idx_txn_user ON transactions(user_id);
      CREATE INDEX IF NOT EXISTS idx_budget_user ON budgets(user_id);
      CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_log(user_id);
    `;
    await this.db.execute(sql);
  },

  // ======================== Password Hashing ========================
  async hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + "mm_salt_2024");
    // WebCrypto (crypto.subtle) only exists in secure contexts: https:// or
    // localhost. When the app is opened over plain http://<lan-ip> on a phone
    // it is undefined, which would make register/login throw. Fall back to the
    // pure-JS SHA-256 below — same standard algorithm, byte-identical output,
    // so password hashes verify across both paths.
    if (globalThis.crypto && crypto.subtle && crypto.subtle.digest) {
      try {
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        return Array.from(new Uint8Array(hashBuffer))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      } catch (_) { /* fall through to the JS implementation */ }
    }
    return sha256Hex(data);
  },

  // ======================== localStorage helpers ========================
  _lsGet(key) {
    try {
      const d = localStorage.getItem(key);
      return d ? JSON.parse(d) : [];
    } catch (e) {
      return [];
    }
  },
  _lsSet(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  },

  // ======================== User Auth ========================
  async registerUser(name, mobile, password) {
    if (!this.isReady) return { success: false, message: "Database not ready" };
    const hashed = await this.hashPassword(password);

    if (this.useNative) {
      // Check duplicate
      const check = await this.db.query("SELECT id FROM users WHERE mobile = ?", [mobile]);
      if (check.values && check.values.length > 0)
        return { success: false, message: "Mobile number already registered" };

      await this.db.run(
        "INSERT INTO users (name, mobile, password) VALUES (?, ?, ?)",
        [name, mobile, hashed]
      );
      const userResult = await this.db.query(
        "SELECT id, name, mobile FROM users WHERE mobile = ?", [mobile]
      );
      if (userResult.values && userResult.values.length > 0) {
        return { success: true, user: userResult.values[0], message: "Registration successful" };
      }
      return { success: false, message: "Registration failed" };
    } else {
      // localStorage mode
      const users = this._lsGet("mm_users");
      if (users.find((u) => u.mobile === mobile))
        return { success: false, message: "Mobile number already registered" };

      const id = Date.now();
      const user = { id, name, mobile, password: hashed };
      users.push(user);
      this._lsSet("mm_users", users);
      return { success: true, user: { id, name, mobile }, message: "Registration successful" };
    }
  },

  async loginUser(mobile, password) {
    if (!this.isReady) return { success: false, message: "Database not ready" };
    const hashed = await this.hashPassword(password);

    if (this.useNative) {
      const result = await this.db.query(
        "SELECT id, name, mobile FROM users WHERE mobile = ? AND password = ?",
        [mobile, hashed]
      );
      if (result.values && result.values.length > 0)
        return { success: true, user: result.values[0], message: "Login successful" };
      return { success: false, message: "Invalid mobile number or password" };
    } else {
      const users = this._lsGet("mm_users");
      const user = users.find((u) => u.mobile === mobile && u.password === hashed);
      if (user) return { success: true, user: { id: user.id, name: user.name, mobile: user.mobile }, message: "Login successful" };
      return { success: false, message: "Invalid mobile number or password" };
    }
  },

  async getUser(userId) {
    if (!this.isReady) return null;
    if (this.useNative) {
      const result = await this.db.query("SELECT id, name, mobile FROM users WHERE id = ?", [userId]);
      return result.values && result.values.length > 0 ? result.values[0] : null;
    } else {
      const users = this._lsGet("mm_users");
      const u = users.find((u) => u.id === userId);
      return u ? { id: u.id, name: u.name, mobile: u.mobile } : null;
    }
  },

  // ======================== Transactions ========================
  async getTransactions(userId) {
    if (!this.isReady) return [];
    if (this.useNative) {
      const result = await this.db.query(
        "SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC, created_at DESC",
        [userId]
      );
      return result.values || [];
    } else {
      const all = this._lsGet("mm_transactions");
      return all.filter((t) => t.user_id === userId).sort((a, b) => (b.date + (b.created_at || "")).localeCompare(a.date + (a.created_at || "")));
    }
  },

  async saveTransaction(userId, transaction) {
    if (!this.isReady) return false;
    if (this.useNative) {
      await this.db.run(
        `INSERT OR REPLACE INTO transactions (id, user_id, type, category, amount, date, description, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [transaction.id, userId, transaction.type, transaction.category, transaction.amount, transaction.date, transaction.description || "", transaction.created_at || new Date().toISOString()]
      );
      return true;
    } else {
      const all = this._lsGet("mm_transactions");
      const idx = all.findIndex((t) => t.id === transaction.id);
      const record = { ...transaction, user_id: userId };
      if (idx !== -1) all[idx] = record;
      else all.push(record);
      this._lsSet("mm_transactions", all);
      return true;
    }
  },

  async deleteTransaction(userId, transactionId) {
    if (!this.isReady) return false;
    if (this.useNative) {
      await this.db.run("DELETE FROM transactions WHERE id = ? AND user_id = ?", [transactionId, userId]);
      return true;
    } else {
      let all = this._lsGet("mm_transactions");
      all = all.filter((t) => !(t.id === transactionId && t.user_id === userId));
      this._lsSet("mm_transactions", all);
      return true;
    }
  },

  // ======================== Budgets ========================
  async getBudgets(userId) {
    if (!this.isReady) return [];
    if (this.useNative) {
      const result = await this.db.query(
        "SELECT * FROM budgets WHERE user_id = ? ORDER BY category ASC",
        [userId]
      );
      return result.values || [];
    } else {
      const all = this._lsGet("mm_budgets");
      return all.filter((b) => b.user_id === userId).sort((a, b) => a.category.localeCompare(b.category));
    }
  },

  async saveBudget(userId, budget) {
    if (!this.isReady) return false;
    if (this.useNative) {
      await this.db.run(
        `INSERT OR REPLACE INTO budgets (id, user_id, category, amount, month)
         VALUES (?, ?, ?, ?, ?)`,
        [budget.id, userId, budget.category, budget.amount, budget.month || ""]
      );
      return true;
    } else {
      const all = this._lsGet("mm_budgets");
      const idx = all.findIndex((b) => b.id === budget.id);
      const record = { ...budget, user_id: userId };
      if (idx !== -1) all[idx] = record;
      else all.push(record);
      this._lsSet("mm_budgets", all);
      return true;
    }
  },

  async deleteBudget(userId, budgetId) {
    if (!this.isReady) return false;
    if (this.useNative) {
      await this.db.run("DELETE FROM budgets WHERE id = ? AND user_id = ?", [budgetId, userId]);
      return true;
    } else {
      let all = this._lsGet("mm_budgets");
      all = all.filter((b) => !(b.id === budgetId && b.user_id === userId));
      this._lsSet("mm_budgets", all);
      return true;
    }
  },

  // ======================== Categories ========================
  async getCategories(userId) {
    if (!this.isReady) return [];
    if (this.useNative) {
      const result = await this.db.query(
        "SELECT * FROM categories WHERE user_id = ? ORDER BY name ASC",
        [userId]
      );
      return result.values || [];
    } else {
      const all = this._lsGet("mm_categories");
      return all.filter((c) => c.user_id === userId).sort((a, b) => a.name.localeCompare(b.name));
    }
  },

  async saveCategory(userId, category) {
    if (!this.isReady) return false;
    if (this.useNative) {
      await this.db.run(
        `INSERT OR REPLACE INTO categories (id, user_id, name, type, icon, color, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          category.id,
          userId,
          category.name,
          category.type || "both",
          category.icon || "bi-tag",
          category.color || "#6366f1",
          category.created_at || new Date().toISOString()
        ]
      );
      return true;
    } else {
      const all = this._lsGet("mm_categories");
      const idx = all.findIndex((c) => c.id === category.id && c.user_id === userId);
      const record = { ...category, user_id: userId };
      if (idx !== -1) all[idx] = record;
      else all.push(record);
      this._lsSet("mm_categories", all);
      return true;
    }
  },

  async deleteCategory(userId, categoryId) {
    if (!this.isReady) return false;
    if (this.useNative) {
      await this.db.run("DELETE FROM categories WHERE id = ? AND user_id = ?", [categoryId, userId]);
      return true;
    } else {
      let all = this._lsGet("mm_categories");
      all = all.filter((c) => !(c.id === categoryId && c.user_id === userId));
      this._lsSet("mm_categories", all);
      return true;
    }
  },

  // ======================== Activity log ========================
  // The authoritative local audit trail. `Audit` (audit.js) writes here first and
  // then forwards the same records to the JSON file / MySQL via the sync server.
  async saveActivity(userId, record) {
    if (!this.isReady) return false;
    const details =
      record.details === undefined || record.details === null
        ? null
        : typeof record.details === "string"
          ? record.details
          : JSON.stringify(record.details);
    if (this.useNative) {
      await this.db.run(
        `INSERT OR REPLACE INTO activity_log
           (id, user_id, user_name, action, entity, entity_id, details, platform, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.id,
          record.user_id === null || record.user_id === undefined ? null : record.user_id,
          record.user_name || null,
          record.action,
          record.entity || null,
          record.entity_id || null,
          details,
          record.platform || null,
          record.created_at || new Date().toISOString(),
        ]
      );
      return true;
    }
    const all = this._lsGet("mm_activity_log");
    all.push({ ...record, details });
    this._lsSet("mm_activity_log", all.slice(-AUDIT_LOCAL_CAP));
    return true;
  },

  async getActivity(userId, limit = 100) {
    if (!this.isReady) return [];
    if (this.useNative) {
      const result = await this.db.query(
        `SELECT * FROM activity_log
          WHERE user_id IS NULL OR user_id = ?
          ORDER BY created_at DESC, id DESC
          LIMIT ?`,
        [userId, limit]
      );
      return (result.values || []).map((row) => ({
        ...row,
        details: row.details ? safeParse(row.details) : null,
      }));
    }
    return this._lsGet("mm_activity_log")
      .filter((r) => r.user_id === null || r.user_id === undefined || r.user_id === userId)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, limit)
      .map((r) => ({ ...r, details: r.details ? safeParse(r.details) : r.details }));
  },

  async clearActivity(userId) {
    if (!this.isReady) return false;
    if (this.useNative) {
      await this.db.run("DELETE FROM activity_log WHERE user_id = ?", [userId]);
      return true;
    }
    this._lsSet(
      "mm_activity_log",
      this._lsGet("mm_activity_log").filter((r) => r.user_id !== userId)
    );
    return true;
  },

  // ======================== Export / Import ========================
  async exportUserDb(userId, activity = null) {
    if (!this.isReady) return null;
    const transactions = await this.getTransactions(userId);
    const budgets = await this.getBudgets(userId);
    const categories = await this.getCategories(userId);
    const user = await this.getUser(userId);
    const activityLog = Array.isArray(activity) ? activity : await this.getActivity(userId, 500);
    return {
      user: user ? { name: user.name, mobile: user.mobile } : null,
      categories,
      transactions, budgets,
      activity: activityLog,
      exported_at: new Date().toISOString(),
      app_name: "Money Manager",
    };
  },

  async importUserDb(userId, data) {
    if (!this.isReady) return false;
    if (data.categories && Array.isArray(data.categories)) {
      for (const c of data.categories) {
        await this.saveCategory(userId, { ...c, user_id: userId });
      }
    }
    if (data.transactions && Array.isArray(data.transactions)) {
      for (const t of data.transactions) {
        await this.saveTransaction(userId, { ...t, user_id: userId });
      }
    }
    if (data.budgets && Array.isArray(data.budgets)) {
      for (const b of data.budgets) {
        await this.saveBudget(userId, { ...b, user_id: userId });
      }
    }
    if (data.activity && Array.isArray(data.activity)) {
      for (const a of data.activity) {
        if (a && a.id && a.action) await this.saveActivity(userId, a);
      }
    }
    return true;
  },
};
