// ======================== Activity Audit Log ========================
// Every user action is persisted to three places:
//
//   1. Local database — SQLite on Android, localStorage on the web (always works
//      offline, this is the source of truth for the Activity Log card).
//   2. JSON file      — data/activity-log.jsonl, via POST /api/activity.
//   3. MySQL          — the same rows in the activity_log table, written by the
//      server when MYSQL_* is configured (see .env.example).
//
// Writes 2 and 3 go through the sync server. Records are queued in localStorage
// whenever the server is unreachable, then retried on the next action/startup,
// so nothing is lost when the app runs fully offline (e.g. inside the Android app).
//
// Audit.scheduleMirror() additionally pushes a full snapshot of the signed-in
// user's data (categories, transactions, budgets) to POST /api/sync, which
// writes data/snapshot.json and mirrors the rows into MySQL tables.

const AUDIT_QUEUE_KEY = "mm_audit_queue";
const AUDIT_API_KEY = "mm_api_base";
const AUDIT_QUEUE_CAP = 1000;

const Audit = {
  apiBase: null,
  queue: [],
  status: "local", // local | ok | error
  lastSync: null,
  lastError: null,
  flushing: false,
  mirrorTimer: null,

  init() {
    this.apiBase = this._resolveApiBase();
    try {
      const raw = localStorage.getItem(AUDIT_QUEUE_KEY);
      this.queue = raw ? JSON.parse(raw) || [] : [];
    } catch (_) {
      this.queue = [];
    }
    if (this.apiBase) this.flush();
    // Retry the backlog as soon as the device regains connectivity.
    window.addEventListener("online", () => this.flush());
    return this;
  },

  // Where the sync server lives. Same origin when the app is served over
  // http(s); overridable with localStorage.mm_api_base or window.MM_API_BASE so a
  // Capacitor build can point at a server on the LAN.
  _resolveApiBase() {
    const clean = (value) => String(value || "").replace(/\/+$/, "");
    try {
      const override = localStorage.getItem(AUDIT_API_KEY);
      if (override) return clean(override);
    } catch (_) { /* ignore */ }
    if (window.MM_API_BASE) return clean(window.MM_API_BASE);
    if (/^https?:$/.test(location.protocol)) return clean(location.origin);
    return null; // file:// or capacitor:// — no server unless configured
  },

  setApiBase(url) {
    const clean = String(url || "").replace(/\/+$/, "");
    if (clean) localStorage.setItem(AUDIT_API_KEY, clean);
    else localStorage.removeItem(AUDIT_API_KEY);
    this.apiBase = this._resolveApiBase();
    if (this.apiBase) this.flush();
    return this.apiBase;
  },

  _platform() {
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
      return "android";
    }
    return /Mobi|Android/i.test(navigator.userAgent) ? "mobile-web" : "web";
  },

  _currentUser() {
    const appState = typeof state !== "undefined" ? state : null;
    return (appState && appState.currentUser) || null;
  },

  // ---- write a single action ------------------------------------------------
  async log(action, options = {}) {
    const user = this._currentUser();
    const record = {
      id: "act_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      user_id: user ? user.id : null,
      user_name: user ? user.name : null,
      action: String(action).slice(0, 64),
      entity: options.entity ? String(options.entity).slice(0, 48) : null,
      entity_id:
        options.entityId === undefined || options.entityId === null
          ? null
          : String(options.entityId).slice(0, 64),
      details: options.details === undefined ? null : options.details,
      platform: this._platform(),
      created_at: new Date().toISOString(),
    };

    // 1. local database (never fails the user action)
    try {
      await AppDB.saveActivity(record.user_id, record);
    } catch (err) {
      console.warn("Audit: local write failed", err);
    }

    // 2 + 3. queue for the JSON file / MySQL
    this.queue.push(record);
    if (this.queue.length > AUDIT_QUEUE_CAP) this.queue = this.queue.slice(-AUDIT_QUEUE_CAP);
    this._persistQueue();
    this.flush();
    return record;
  },

  _persistQueue() {
    try {
      localStorage.setItem(AUDIT_QUEUE_KEY, JSON.stringify(this.queue));
    } catch (_) { /* quota — keep going, local log already has the record */ }
  },

  // ---- push queued records to the sync server ------------------------------
  async flush() {
    if (!this.apiBase || this.flushing || !this.queue.length) return false;
    this.flushing = true;
    const batch = this.queue.slice();
    try {
      const res = await fetch(this.apiBase + "/api/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records: batch }),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const ids = new Set(batch.map((r) => r.id));
      this.queue = this.queue.filter((r) => !ids.has(r.id));
      this._persistQueue();
      this.status = "ok";
      this.lastError = null;
      this.lastSync = new Date().toISOString();
      return true;
    } catch (err) {
      // Offline or server down — keep the queue for the next attempt.
      this.status = "error";
      this.lastError = err.message;
      return false;
    } finally {
      this.flushing = false;
      // Records logged while this batch was in flight (e.g. "session_open" right
      // after startup) still need to go out — drain them now that we are free.
      if (this.status === "ok" && this.queue.length) {
        setTimeout(() => this.flush(), 50);
      }
    }
  },

  // ---- full data mirror (JSON snapshot + MySQL tables) ---------------------
  scheduleMirror(delay = 1200) {
    if (!this.apiBase) return;
    clearTimeout(this.mirrorTimer);
    this.mirrorTimer = setTimeout(() => this.mirrorSnapshot(), delay);
  },

  async mirrorSnapshot() {
    if (!this.apiBase) return false;
    const user = this._currentUser();
    if (!user) return false;
    const appState = typeof state !== "undefined" ? state : {};
    try {
      const res = await fetch(this.apiBase + "/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user: { id: user.id, name: user.name, mobile: user.mobile },
          categories: appState.customCategories || [],
          transactions: appState.transactions || [],
          budgets: appState.budgets || [],
        }),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      this.status = "ok";
      this.lastError = null;
      this.lastSync = new Date().toISOString();
      return true;
    } catch (err) {
      this.status = "error";
      this.lastError = err.message;
      return false;
    }
  },

  // ---- read / export / clear ----------------------------------------------
  async list(limit = 100) {
    const user = this._currentUser();
    return AppDB.getActivity(user ? user.id : null, limit);
  },

  async clear() {
    const user = this._currentUser();
    if (user) {
      await AppDB.clearActivity(user.id);
      // Drop records that never reached the server so "clear" really clears.
      this.queue = this.queue.filter((r) => r.user_id !== user.id);
      this._persistQueue();
    }
    return true;
  },

  statusLabel() {
    if (!this.apiBase) return "local only";
    if (this.status === "ok") return "synced";
    if (this.status === "error") return "offline — queued";
    return this.queue.length ? `${this.queue.length} queued` : "ready";
  },
};
